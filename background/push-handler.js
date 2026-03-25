// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Push handler – orchestrates pushing queued games to GitHub.
 *
 * Push flow:
 *   1. Read current queue from storage
 *   2. Fetch current temp_info.jsonl from GitHub (content + SHA)
 *   3. Append queue entries as JSONL lines
 *   4. PUT updated file to GitHub with commit message
 *   5. On success: clear pushed entries, refresh dedup cache, log event
 *   6. On failure: keep queue intact, log error
 *
 * Supports:
 *   - Pushing all queued entries
 *   - Pushing selected entries (by appid list)
 *   - SHA conflict retry (re-fetch + re-merge, once)
 */

import {REPO_TEMP_PATH} from "../shared/constants.js";
import {loadQueue, loadSettings, saveQueue} from "../shared/storage.js";
import {extractAppId} from "../shared/utils.js";
import {logError, logInfo, logWarn} from "../shared/logger.js";
import {
    createBlob,
    createSignedCommit,
    createTree,
    getFileContent,
    getHeadCommit,
    invalidatePath,
    putFileContent,
    updateRef,
} from "./github-api.js";
import {refreshDedupCache} from "./dedup-checker.js";
import {buildCommitPayload, getKeyMeta, isSigningAvailable, signCommitPayload} from "./gpg-signer.js";

/**
 * Convert a queue entry to a JSONL-compatible object.
 * Only includes fields that the backend ingest_new.py expects.
 *
 * @param {object} entry - Queue entry
 * @returns {object} Cleaned object for JSONL line
 */
function toTempEntry(entry) {
    const obj = {link: entry.link};

    // Include optional fields only if user set them (non-default)
    if (entry.type_game && entry.type_game !== "offline") {
        obj.type_game = entry.type_game;
    }
    if (entry.anti_cheat && entry.anti_cheat !== "-") {
        obj.anti_cheat = entry.anti_cheat;
    }
    if (entry.notes && entry.notes.trim()) {
        obj.notes = entry.notes.trim();
    }
    if (entry.safe && entry.safe !== "?") {
        obj.safe = entry.safe;
    }
    if (entry.genre && entry.genre.trim()) {
        obj.genre = entry.genre.trim();
    }

    return obj;
}

/**
 * Build the JSONL string to append.
 *
 * @param {object[]} entries - Queue entries to push
 * @returns {string} JSONL lines (each line is a JSON object)
 */
function buildJSONLLines(entries) {
    return entries.map((e) => JSON.stringify(toTempEntry(e))).join("\n");
}

/**
 * Build commit message.
 *
 * @param {number} count - Number of games pushed
 * @param {string} prefix - Commit message prefix from settings
 * @returns {string}
 */
function buildCommitMessage(count, prefix) {
    const date = new Date().toISOString().slice(0, 10);
    return `${prefix} add ${count} game(s) [${date}]`;
}

/**
 * Merge new JSONL lines into existing file content.
 * Handles edge cases: empty file, file with/without trailing newline.
 *
 * @param {string} existing - Current file content (maybe empty)
 * @param {string} newLines - New JSONL lines to append
 * @returns {string} Merged content
 */
function mergeContent(existing, newLines) {
    const trimmed = existing.trimEnd();
    if (!trimmed) {
        // File was empty or missing
        return newLines + "";
    }
    // Ensure single newline between existing and new content
    return trimmed + "" + newLines + "";
}

/**
 * Execute an unsigned push via the simple Contents API.
 *
 * @param {object[]} entries - Entries to push
 * @param {object} settings - Current settings
 * @returns {Promise<{ok: boolean, commitSha?: string}>}
 */
async function executeUnsignedPush(entries, settings) {
    const newLines = buildJSONLLines(entries);
    const commitMsg = buildCommitMessage(entries.length, settings.commit_prefix || "ext:");

    // 1) Fetch current temp_info.jsonl (may not exist yet)
    let existingContent = "";
    let existingSha = null;

    try {
        const file = await getFileContent(REPO_TEMP_PATH, {
            useCache: false,
            allowMissing: true,
        });
        if (file) {
            existingContent = file.content;
            existingSha = file.sha;
        }
    } catch (err) {
        if (err.type === "auth") throw err;
        await logWarn("push", `Could not fetch temp_info.jsonl: ${err.message}. Will create new.`);
    }

    // 2) Merge content
    const merged = mergeContent(existingContent, newLines);

    // 3) PUT to GitHub
    const result = await putFileContent(REPO_TEMP_PATH, merged, existingSha, commitMsg);

    return {ok: true, commitSha: result.commitSha};
}

/**
 * Execute a GPG-signed push via the Git Database API.
 *
 * Flow: create blob → create tree → sign payload → create commit → update ref
 *
 * @param {object[]} entries - Entries to push
 * @param {object} settings - Current settings
 * @returns {Promise<{ok: boolean, commitSha?: string, signed: boolean}>}
 */
async function executeSignedPush(entries, settings) {
    const newLines = buildJSONLLines(entries);
    const commitMsg = buildCommitMessage(entries.length, settings.commit_prefix || "ext:");

    // ── Identity resolution for GPG-verified commits ──
    // GitHub requires the committer email to match the GPG key's UID email.
    // The key must also be registered in the committer's GitHub account.
    //
    // Author  = who wrote the change (shown as "X authored")
    // Committer = who signed it (shown as "X committed", signature verified here)
    const keyMeta = await getKeyMeta();

    // Committer = GPG key owner — email MUST match key UID
    const committerName = keyMeta?.uidName || settings.committer_name || "steam-f2p-ext[bot]";
    const committerEmail = keyMeta?.uidEmail || settings.committer_email || "noreply@github.com";

    // Author = bot identity; if user sets a different name in settings, use it
    // Otherwise default to same as committer (single-identity mode)
    const authorName = settings.committer_name || committerName;
    const authorEmail = settings.committer_email || committerEmail;

    // 1) Fetch current file content to merge
    let existingContent = "";
    try {
        const file = await getFileContent(REPO_TEMP_PATH, {
            useCache: false,
            allowMissing: true,
        });
        if (file) {
            existingContent = file.content;
        }
    } catch (err) {
        if (err.type === "auth") throw err;
        await logWarn("push", `Could not fetch temp_info.jsonl for signed push: ${err.message}`);
    }

    const merged = mergeContent(existingContent, newLines);

    // 2) Get current HEAD
    const head = await getHeadCommit();

    // 3) Create blob with merged content
    const blobSha = await createBlob(merged);

    // 4) Create tree
    const treeSha = await createTree(head.treeSha, REPO_TEMP_PATH, blobSha);

    // 5) Single timestamp for both payload and API — mismatch = unverified
    const now = new Date();
    const unixTimestamp = Math.floor(now.getTime() / 1000);
    const isoDate = new Date(unixTimestamp * 1000).toISOString();

    // 6) Build commit payload and sign it
    const payload = buildCommitPayload({
        treeSha,
        parentSha: head.sha,
        authorName,
        authorEmail,
        committerName,
        committerEmail,
        message: commitMsg,
        timestamp: unixTimestamp,
    });

    const signResult = await signCommitPayload(payload);
    if (!signResult.ok) {
        throw {type: "gpg_failed", message: signResult.error};
    }

    // 7) Create signed commit — same identity and date as signed payload
    const commitSha = await createSignedCommit({
        treeSha,
        parentSha: head.sha,
        message: commitMsg,
        signature: signResult.signature,
        authorName,
        authorEmail,
        committerName,
        committerEmail,
        date: isoDate,
    });

    // 8) Update branch ref
    await updateRef(commitSha);

    return {ok: true, commitSha, signed: true};
}

/**
 * Execute one push attempt — routes to signed or unsigned path.
 *
 * @param {object[]} entries - Entries to push
 * @param {object} settings - Current settings
 * @returns {Promise<{ok: boolean, commitSha?: string, signed?: boolean, error?: string}>}
 */
async function executePush(entries, settings) {
    const useGPG = settings.gpg_enabled && await isSigningAvailable();

    if (useGPG) {
        try {
            return await executeSignedPush(entries, settings);
        } catch (err) {
            if (err.type === "gpg_failed") {
                // GPG signing failed — log warning, do NOT auto-fallback
                // The caller (pushQueue) will return the error and let UI ask user
                await logWarn("push", `GPG signing failed: ${err.message}`);
                throw err;
            }
            throw err;
        }
    }

    return await executeUnsignedPush(entries, settings);
}

/**
 * Push queued games to GitHub.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.appids] - Specific appids to push (default: all)
 * @returns {Promise<{ok: boolean, pushed: number, commitSha?: string, error?: string}>}
 */
export async function pushQueue(opts = {}) {
    const settings = await loadSettings();

    // Validate config
    if (!settings.github_owner || !settings.github_repo || !settings.github_token) {
        return {ok: false, pushed: 0, error: "GitHub not configured — open Settings to set up"};
    }

    // Load queue
    const queue = await loadQueue();
    if (queue.length === 0) {
        return {ok: false, pushed: 0, error: "Queue is empty"};
    }

    // Select entries to push
    let toPush;
    let toKeep;

    if (opts.appids && opts.appids.length > 0) {
        const pushSet = new Set(opts.appids);
        toPush = queue.filter((g) => pushSet.has(extractAppId(g.link)));
        toKeep = queue.filter((g) => !pushSet.has(extractAppId(g.link)));
    } else {
        toPush = [...queue];
        toKeep = [];
    }

    if (toPush.length === 0) {
        return {ok: false, pushed: 0, error: "No matching entries found in queue"};
    }

    await logInfo("push", `Pushing ${toPush.length} game(s) to GitHub...`, {
        count: toPush.length,
        appids: toPush.map((g) => extractAppId(g.link)).filter(Boolean),
    });

    // Attempt push (with one retry on SHA conflict)
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            const result = await executePush(toPush, settings);

            if (result.ok) {
                // Success — clear pushed entries from queue
                await saveQueue(toKeep);

                // Invalidate cache so next dedup check sees new entries
                await invalidatePath(REPO_TEMP_PATH);

                // Refresh dedup cache in background (don't block response)
                refreshDedupCache().catch((err) => {
                    logWarn("push", `Post-push cache refresh failed: ${err.message || err}`);
                });

                const signedLabel = result.signed ? " (GPG signed)" : "";
                await logInfo("push", `Successfully pushed ${toPush.length} game(s)${signedLabel}`, {
                    commitSha: result.commitSha,
                    remaining: toKeep.length,
                    signed: !!result.signed,
                });

                return {
                    ok: true,
                    pushed: toPush.length,
                    commitSha: result.commitSha,
                    remaining: toKeep.length,
                    signed: !!result.signed,
                };
            }
        } catch (err) {
            if (err.type === "conflict" && attempts < maxAttempts) {
                await logWarn("push", "SHA conflict detected — retrying with fresh SHA...");
                continue;
            }

            if (err.type === "gpg_failed") {
                // Return specific error so UI can offer unsigned fallback
                return {
                    ok: false,
                    pushed: 0,
                    error: err.message || "GPG signing failed",
                    gpgFailed: true,
                };
            }

            // Non-retryable error
            await logError("push", `Push failed: ${err.message || JSON.stringify(err)}`, {
                type: err.type,
                status: err.status,
                attempt: attempts,
            });

            return {
                ok: false,
                pushed: 0,
                error: err.message || "Push failed — check logs for details",
            };
        }
    }

    return {ok: false, pushed: 0, error: "Push failed after all retries"};
}

/**
 * Push without GPG signing (explicit unsigned fallback).
 * Called when user confirms they want to push unsigned after GPG failure.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.appids] - Specific appids to push
 * @returns {Promise<{ok: boolean, pushed: number, commitSha?: string, error?: string}>}
 */
export async function pushQueueUnsigned(opts = {}) {
    const settings = await loadSettings();

    // Temporarily disable GPG for this push
    const overridden = {...settings, gpg_enabled: false};

    const queue = await loadQueue();
    if (queue.length === 0) {
        return {ok: false, pushed: 0, error: "Queue is empty"};
    }

    let toPush, toKeep;
    if (opts.appids && opts.appids.length > 0) {
        const pushSet = new Set(opts.appids);
        toPush = queue.filter((g) => pushSet.has(extractAppId(g.link)));
        toKeep = queue.filter((g) => !pushSet.has(extractAppId(g.link)));
    } else {
        toPush = [...queue];
        toKeep = [];
    }

    if (toPush.length === 0) {
        return {ok: false, pushed: 0, error: "No matching entries found"};
    }

    await logInfo("push", `Pushing ${toPush.length} game(s) unsigned (GPG fallback)...`);

    try {
        const result = await executeUnsignedPush(toPush, overridden);
        if (result.ok) {
            await saveQueue(toKeep);
            await invalidatePath(REPO_TEMP_PATH);
            refreshDedupCache().catch(() => {
            });

            await logInfo("push", `Pushed ${toPush.length} game(s) unsigned`, {
                commitSha: result.commitSha,
            });

            return {
                ok: true,
                pushed: toPush.length,
                commitSha: result.commitSha,
                remaining: toKeep.length,
                signed: false
            };
        }
    } catch (err) {
        await logError("push", `Unsigned push failed: ${err.message || err}`);
        return {ok: false, pushed: 0, error: err.message || "Push failed"};
    }

    return {ok: false, pushed: 0, error: "Push failed"};
}
