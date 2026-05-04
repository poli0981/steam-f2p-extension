// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Push handler – orchestrates pushing queue entries to GitHub.
 *
 * Supports two paths:
 *   - Unsigned: GitHub Contents API (PUT)
 *   - Signed:   Git Database API (blob → tree → signed commit → ref update)
 *
 * toTempEntry() serializes the FULL game entry (auto + editable fields)
 * to a JSONL line for temp_info.jsonl.
 */

import { REPO_TEMP_PATH } from "../shared/constants.js";
import { loadQueue, saveQueue, loadSettings } from "../shared/storage.js";
import { extractAppId, nowISO } from "../shared/utils.js";
import { logInfo, logWarn, logError } from "../shared/logger.js";
import {
    getFileContent, putFileContent, invalidatePath,
    getHeadCommit, createBlob, createTree, createSignedCommit, updateRef,
} from "./github-api.js";
import { fetchRemoteAppIds, refreshDedupCache } from "./dedup-checker.js";
import { pruneDuplicates } from "./queue-manager.js";
import { signCommitPayload, buildCommitPayload, isSigningAvailable, getKeyMeta } from "./gpg-signer.js";

/**
 * After a successful push, force-refresh the dedup cache and (when enabled)
 * prune queue entries whose appids landed on master while we weren't looking.
 *
 * Silent: errors logged at warn level, no toast — the user just saw the
 * "Pushed N games" toast and we don't want to clobber that.
 *
 * @param {object} settings - Settings snapshot already loaded by the caller
 */
async function refreshCacheAndMaybePrune(settings) {
    try {
        await refreshDedupCache();
        if (settings && settings.auto_prune_queue) {
            const set = await fetchRemoteAppIds(false);
            await pruneDuplicates(set);
        }
    } catch (err) {
        await logWarn("dedup", `Post-push refresh/prune failed: ${err.message || err}`);
    }
}

// ════════════════════════════════════════════════════════════
// Entry serialization
// ════════════════════════════════════════════════════════════

/**
 * Convert a queue entry to a JSONL-ready object.
 *
 * Includes ALL fields — both auto-detected and user-edited.
 * The backend (ingest_new.py) will pick whichever fields it needs;
 * extra fields are preserved for future use or other consumers.
 *
 * Fields are ordered logically:
 *   1. Identity (link, name, appid)
 *   2. Classification (genre, type_game, free_type)
 *   3. Auto-detected metadata (developer, publisher, release_date, description, ...)
 *   4. Anti-cheat info
 *   5. Supplementary (platforms, languages, tags)
 *   6. User annotations (notes, safe)
 *   7. Extension metadata (added_at)
 *
 * Empty strings, empty arrays, and null values are omitted to keep
 * JSONL lines compact. The "-" default for anti_cheat is also omitted.
 *
 * @param {object} entry - Queue entry
 * @returns {object} Cleaned object for JSONL line
 */
function toTempEntry(entry) {
    const obj = {};

    // ── 1. Identity ──
    obj.link = entry.link;
    if (entry.name) obj.name = entry.name;

    // ── 2. Classification ──
    if (entry.genre)     obj.genre = entry.genre;
    if (entry.type_game) obj.type_game = entry.type_game;
    if (entry.free_type) obj.free_type = entry.free_type;

    // ── 3. Auto-detected metadata ──
    if (entry.developer && (Array.isArray(entry.developer) ? entry.developer.length > 0 : true)) {
        obj.developer = entry.developer;
    }
    if (entry.publisher && (Array.isArray(entry.publisher) ? entry.publisher.length > 0 : true)) {
        obj.publisher = entry.publisher;
    }
    if (entry.release_date) obj.release_date = entry.release_date;
    if (entry.description)  obj.description = entry.description;
    if (entry.header_image) obj.header_image = entry.header_image;

    // ── 4. Anti-cheat ──
    if (entry.anti_cheat && entry.anti_cheat !== "-") {
        obj.anti_cheat = entry.anti_cheat;
    }
    if (entry.anti_cheat_note) {
        obj.anti_cheat_note = entry.anti_cheat_note;
    }
    if (entry.is_kernel_ac !== undefined && entry.is_kernel_ac !== null) {
        obj.is_kernel_ac = entry.is_kernel_ac;
    }

    // ── 5. Supplementary (arrays) ──
    if (entry.platforms && entry.platforms.length > 0) {
        obj.platforms = entry.platforms;
    }
    if (entry.languages && entry.languages.length > 0) {
        obj.languages = entry.languages;
    }
    if (entry.language_details && entry.language_details.length > 0) {
        obj.language_details = entry.language_details;
    }
    if (entry.tags && entry.tags.length > 0) {
        obj.tags = entry.tags;
    }

    // ── 6. User annotations ──
    if (entry.notes && entry.notes.trim()) {
        obj.notes = entry.notes.trim();
    }
    if (entry.safe && entry.safe !== "?") {
        obj.safe = entry.safe;
    }

    // ── 7. Extension metadata ──
    if (entry.added_at) obj.added_at = entry.added_at;

    return obj;
}

/**
 * Build the JSONL string to append.
 * @param {object[]} entries - Queue entries to push
 * @returns {string} JSONL lines (each line is a JSON object)
 */
function buildJSONLLines(entries) {
    return entries.map((e) => JSON.stringify(toTempEntry(e))).join("\n");
}

/**
 * Build commit message.
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
 * @param {string} existing - Current file content (may be empty)
 * @param {string} newLines - New JSONL lines to append
 * @returns {string} Merged content
 */
function mergeContent(existing, newLines) {
    const trimmed = existing.trimEnd();
    if (!trimmed) {
        return newLines + "\n";
    }
    return trimmed + "\n" + newLines + "\n";
}

// ════════════════════════════════════════════════════════════
// Push execution paths
// ════════════════════════════════════════════════════════════

/**
 * Execute an unsigned push via the simple Contents API.
 */
async function executeUnsignedPush(entries, settings) {
    const newLines = buildJSONLLines(entries);
    const commitMsg = buildCommitMessage(entries.length, settings.commit_prefix || "ext:");

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

    const merged = mergeContent(existingContent, newLines);
    const result = await putFileContent(REPO_TEMP_PATH, merged, existingSha, commitMsg);

    return { ok: true, commitSha: result.commitSha };
}

/**
 * Execute a GPG-signed push via the Git Database API.
 * Flow: create blob → create tree → sign payload → create commit → update ref
 */
async function executeSignedPush(entries, settings) {
    const newLines = buildJSONLLines(entries);
    const commitMsg = buildCommitMessage(entries.length, settings.commit_prefix || "ext:");

    // ── Identity resolution ──
    // For GPG-verified commits, committer email MUST match GPG key UID.
    // Author can differ (extension bot identity).
    const keyMeta = await getKeyMeta();
    const keyEmail = keyMeta?.userIDs?.[0]?.match(/<(.+?)>/)?.[1] || "";

    const committerName = settings.committer_name || "steam-f2p-ext";
    const committerEmail = keyEmail || settings.committer_email || "noreply@github.com";
    const authorName = "steam-f2p-ext[bot]";
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

    // 3) Create blob
    const blobSha = await createBlob(merged);

    // 4) Create tree
    const treeSha = await createTree(head.treeSha, REPO_TEMP_PATH, blobSha);

    // 5) Timestamp — must be identical in payload and API call
    const now = new Date();
    const unixTimestamp = Math.floor(now.getTime() / 1000);
    const isoDate = new Date(unixTimestamp * 1000).toISOString();

    // 6) Build commit payload and sign
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
        throw { type: "gpg_failed", message: signResult.error };
    }

    // 7) Create signed commit
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

    return { ok: true, commitSha, signed: true };
}

/**
 * Route to signed or unsigned push based on settings.
 */
async function executePush(entries, settings) {
    if (settings.gpg_enabled && await isSigningAvailable()) {
        return executeSignedPush(entries, settings);
    }
    return executeUnsignedPush(entries, settings);
}

// ════════════════════════════════════════════════════════════
// Public API
// ════════════════════════════════════════════════════════════

/**
 * Push queued entries to GitHub.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.appids] - Specific appids to push (default: all)
 * @returns {Promise<{ok, pushed, commitSha?, remaining?, signed?, error?, gpgFailed?}>}
 */
export async function pushQueue(opts = {}) {
    const settings = await loadSettings();

    if (!settings.github_owner || !settings.github_repo || !settings.github_token) {
        return { ok: false, pushed: 0, error: "GitHub not configured — check Settings" };
    }

    const queue = await loadQueue();
    if (queue.length === 0) {
        return { ok: false, pushed: 0, error: "Queue is empty" };
    }

    // Split queue: entries to push vs entries to keep
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
        return { ok: false, pushed: 0, error: "No matching entries found" };
    }

    await logInfo("push", `Pushing ${toPush.length} game(s) to ${settings.github_owner}/${settings.github_repo}...`);

    // Attempt push with one retry on SHA conflict
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            const result = await executePush(toPush, settings);

            if (result.ok) {
                await saveQueue(toKeep);
                await invalidatePath(REPO_TEMP_PATH);
                refreshCacheAndMaybePrune(settings).catch(() => {});

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
                return {
                    ok: false,
                    pushed: 0,
                    error: err.message || "GPG signing failed",
                    gpgFailed: true,
                };
            }

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

    return { ok: false, pushed: 0, error: "Push failed after all retries" };
}

/**
 * Push without GPG signing (explicit unsigned fallback).
 * Called when user confirms they want to push unsigned after GPG failure.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.appids] - Specific appids to push
 * @returns {Promise<{ok, pushed, commitSha?, remaining?, signed?, error?}>}
 */
export async function pushQueueUnsigned(opts = {}) {
    const settings = await loadSettings();
    const overridden = { ...settings, gpg_enabled: false };

    const queue = await loadQueue();
    if (queue.length === 0) {
        return { ok: false, pushed: 0, error: "Queue is empty" };
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
        return { ok: false, pushed: 0, error: "No matching entries found" };
    }

    await logInfo("push", `Pushing ${toPush.length} game(s) unsigned (GPG fallback)...`);

    try {
        const result = await executeUnsignedPush(toPush, overridden);
        if (result.ok) {
            await saveQueue(toKeep);
            await invalidatePath(REPO_TEMP_PATH);
            refreshCacheAndMaybePrune(settings).catch(() => {});

            await logInfo("push", `Pushed ${toPush.length} game(s) unsigned`, {
                commitSha: result.commitSha,
            });

            return {
                ok: true,
                pushed: toPush.length,
                commitSha: result.commitSha,
                remaining: toKeep.length,
                signed: false,
            };
        }
    } catch (err) {
        await logError("push", `Unsigned push failed: ${err.message || err}`);
        return { ok: false, pushed: 0, error: err.message || "Push failed" };
    }

    return { ok: false, pushed: 0, error: "Push failed" };
}
