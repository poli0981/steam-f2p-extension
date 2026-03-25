// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * GitHub REST API client.
 *
 * Handles all communication with GitHub:
 *   - Contents API: read/write files (temp_info.jsonl, data.jsonl)
 *   - Response caching with TTL
 *   - Base64 encode/decode for file content
 *   - Error classification (auth, rate-limit, conflict, network)
 */

import {GITHUB_API_BASE} from "../shared/constants.js";
import {loadSettings} from "../shared/storage.js";
import {logDebug, logError, logInfo} from "../shared/logger.js";

// ── In-memory response cache ──
const cache = new Map ();

/**
 * @typedef {Object} GitHubFileResult
 * @property {string} content  - Decoded file content (UTF-8)
 * @property {string} sha      - Blob SHA (needed for updates)
 * @property {string} path     - File path in repo
 */

/**
 * @typedef {Object} GitHubError
 * @property {string} type     - "auth" | "not_found" | "rate_limit" | "conflict" | "network" | "unknown"
 * @property {number} status   - HTTP status code
 * @property {string} message  - Human-readable error
 */

// ── Helpers ──

function cacheKey (owner, repo, path, branch) {
    return `${owner}/${repo}/${branch}:${path}`;
}

function isCacheValid (entry, ttlMs) {
    return entry && (
        Date.now () - entry.timestamp
    ) < ttlMs;
}

/**
 * Classify a fetch error or HTTP status into a typed error object.
 */
function classifyError (status, body = "") {
    if (status === 401 || status === 403) {
        // Distinguish rate-limit from auth
        if (typeof body === "string" && body.includes ("rate limit")) {
            return {type: "rate_limit", status, message: "GitHub API rate limit exceeded"};
        }
        return {type: "auth", status, message: "Authentication failed — check your token"};
    }
    if (status === 404) {
        return {type: "not_found", status, message: "File or repository not found"};
    }
    if (status === 409) {
        return {type: "conflict", status, message: "SHA conflict — file was modified remotely"};
    }
    if (status === 422) {
        return {type: "validation", status, message: "GitHub rejected the request (validation error)"};
    }
    if (status >= 500) {
        return {type: "server", status, message: `GitHub server error (${status})`};
    }
    return {type: "unknown", status, message: `Unexpected HTTP ${status}`};
}

// ── Core API methods ──

/**
 * Build request headers with auth token.
 */
function makeHeaders (token) {
    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
    };
}

/**
 * Get the current settings needed for API calls.
 * @returns {Promise<{owner: string, repo: string, branch: string, token: string}>}
 * @throws {Error} if required fields are missing
 */
async function getConfig () {
    const s = await loadSettings ();
    if (!s.github_owner || !s.github_repo || !s.github_token) {
        throw new Error ("GitHub not configured — set owner, repo, and token in Settings");
    }
    return {
        owner: s.github_owner,
        repo: s.github_repo,
        branch: s.github_branch || "main",
        token: s.github_token,
        cacheTtl: (
                      s.cache_ttl_minutes || 5
                  ) * 60 * 1000,
        commitPrefix: s.commit_prefix || "ext:",
        committerName: s.committer_name || "steam-f2p-ext[bot]",
        committerEmail: s.committer_email || "noreply@github.com",
    };
}

/**
 * Fetch a file's content and SHA from the GitHub Contents API.
 *
 * @param {string} path - File path in repo (e.g. "scripts/data.jsonl")
 * @param {object} [opts]
 * @param {boolean} [opts.useCache=true] - Whether to use cached response
 * @param {boolean} [opts.allowMissing=false] - Return null instead of throwing on 404
 * @returns {Promise<GitHubFileResult|null>}
 */
export async function getFileContent (path, opts = {}) {
    const {useCache = true, allowMissing = false} = opts;
    const cfg = await getConfig ();
    const key = cacheKey (cfg.owner, cfg.repo, path, cfg.branch);

    // Check cache
    if (useCache && isCacheValid (cache.get (key), cfg.cacheTtl)) {
        await logDebug ("github", `Cache hit: ${path}`);
        return cache.get (key).data;
    }

    const url = `${GITHUB_API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${cfg.branch}`;

    let resp;
    try {
        resp = await fetch (url, {headers: makeHeaders (cfg.token)});
    }
    catch (err) {
        await logError ("github", `Network error fetching ${path}: ${err.message}`);
        throw {type: "network", status: 0, message: `Network error: ${err.message}`};
    }

    if (!resp.ok) {
        if (resp.status === 404 && allowMissing) {
            await logDebug ("github", `File not found (allowed): ${path}`);
            return null;
        }
        const body = await resp.text ()
                               .catch (() => "");
        const err = classifyError (resp.status, body);
        await logError ("github", `${err.message} (${path})`, {status: resp.status});
        throw err;
    }

    const json = await resp.json ();

    // GitHub returns base64-encoded content for files
    let content = "";
    if (json.content) {
        // Content may have newlines in the base64 string
        const raw = json.content.replace (/\n/g, "");
        content = decodeBase64 (raw);
    }

    const result = {
        content,
        sha: json.sha,
        path: json.path || path,
    };

    // Update cache
    cache.set (key, {data: result, timestamp: Date.now ()});

    await logDebug ("github", `Fetched ${path} (${content.length} chars, sha: ${json.sha.slice (0, 7)})`);
    return result;
}

/**
 * Create or update a file via the GitHub Contents API.
 *
 * @param {string} path - File path in repo
 * @param {string} content - New file content (UTF-8 string)
 * @param {string|null} sha - Current file SHA (null for new files)
 * @param {string} message - Commit message
 * @returns {Promise<{sha: string, commitSha: string}>}
 */
export async function putFileContent (path, content, sha, message) {
    const cfg = await getConfig ();

    const body = {
        message,
        content: encodeBase64 (content),
        branch: cfg.branch,
        committer: {
            name: cfg.committerName,
            email: cfg.committerEmail,
        },
    };

    // Include SHA if updating existing file (required by API)
    if (sha) {
        body.sha = sha;
    }

    const url = `${GITHUB_API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;

    let resp;
    try {
        resp = await fetch (url, {
            method: "PUT",
            headers: makeHeaders (cfg.token),
            body: JSON.stringify (body),
        });
    }
    catch (err) {
        await logError ("github", `Network error writing ${path}: ${err.message}`);
        throw {type: "network", status: 0, message: `Network error: ${err.message}`};
    }

    if (!resp.ok) {
        const respBody = await resp.text ()
                                   .catch (() => "");
        const err = classifyError (resp.status, respBody);
        await logError ("github", `${err.message} (PUT ${path})`, {status: resp.status});
        throw err;
    }

    const json = await resp.json ();

    // Invalidate cache for this path
    const key = cacheKey (cfg.owner, cfg.repo, path, cfg.branch);
    cache.delete (key);

    const result = {
        sha: json.content?.sha || "",
        commitSha: json.commit?.sha || "",
    };

    await logInfo ("github", `Updated ${path} (commit: ${result.commitSha.slice (0, 7)})`, {path});
    return result;
}

/**
 * Invalidate all cached entries.
 */
export function clearCache () {
    cache.clear ();
}

/**
 * Invalidate cache for a specific file path.
 */
export async function invalidatePath (path) {
    const cfg = await getConfig ();
    const key = cacheKey (cfg.owner, cfg.repo, path, cfg.branch);
    cache.delete (key);
}

// ── Git Database API (for signed commits) ──
// The Contents API doesn't support GPG signatures.
// For signed commits we must use the lower-level Git Database API:
//   1. Create a blob with the file content
//   2. Create a tree referencing the blob
//   3. Create a commit with tree + parent + signature
//   4. Update the branch ref to point to the new commit

/**
 * Perform a generic GitHub API request.
 * @private
 */
async function githubFetch (method, endpoint, body = null) {
    const cfg = await getConfig ();
    const url = `${GITHUB_API_BASE}/repos/${cfg.owner}/${cfg.repo}${endpoint}`;

    const init = {
        method,
        headers: makeHeaders (cfg.token),
    };
    if (body) {
        init.body = JSON.stringify (body);
    }

    let resp;
    try {
        resp = await fetch (url, init);
    }
    catch (err) {
        throw {type: "network", status: 0, message: `Network error: ${err.message}`};
    }

    if (!resp.ok) {
        const text = await resp.text ()
                               .catch (() => "");
        throw classifyError (resp.status, text);
    }

    return resp.json ();
}

/**
 * Get the current commit SHA for a branch ref.
 *
 * @returns {Promise<{sha: string, treeSha: string}>}
 */
export async function getHeadCommit () {
    const cfg = await getConfig ();
    const data = await githubFetch ("GET", `/git/ref/heads/${cfg.branch}`);
    const commitSha = data.object.sha;

    // Get the tree SHA from the commit
    const commit = await githubFetch ("GET", `/git/commits/${commitSha}`);
    return {sha: commitSha, treeSha: commit.tree.sha};
}

/**
 * Create a blob on GitHub.
 *
 * @param {string} content - File content (UTF-8)
 * @returns {Promise<string>} Blob SHA
 */
export async function createBlob (content) {
    const data = await githubFetch ("POST", "/git/blobs", {
        content: encodeBase64 (content),
        encoding: "base64",
    });
    return data.sha;
}

/**
 * Create a tree on GitHub.
 * Creates a new tree with the specified file, based on a parent tree.
 *
 * @param {string} baseTreeSha - Parent tree SHA
 * @param {string} path - File path in repo
 * @param {string} blobSha - Blob SHA for the file
 * @returns {Promise<string>} New tree SHA
 */
export async function createTree (baseTreeSha, path, blobSha) {
    const data = await githubFetch ("POST", "/git/trees", {
        base_tree: baseTreeSha,
        tree: [
            {
                path,
                mode: "100644",
                type: "blob",
                sha: blobSha,
            }
        ],
    });
    return data.sha;
}

/**
 * Create a signed commit on GitHub via Git Database API.
 *
 * CRITICAL: The `date` field must correspond to the same Unix timestamp
 * used in buildCommitPayload(). GitHub converts ISO date to Unix ts
 * internally; any mismatch makes the signature unverifiable.
 *
 * @param {object} params
 * @param {string} params.treeSha
 * @param {string} params.parentSha
 * @param {string} params.message
 * @param {string} params.signature    - ASCII-armored GPG detached signature
 * @param {string} params.authorName   - Author display name
 * @param {string} params.authorEmail  - Author email
 * @param {string} params.committerName  - Committer (signer) name
 * @param {string} params.committerEmail - Committer email (must match GPG key)
 * @param {string} params.date         - ISO 8601 date string (synced with payload)
 * @returns {Promise<string>} New commit SHA
 */
export async function createSignedCommit ({
                                              treeSha, parentSha, message, signature,
                                              authorName, authorEmail,
                                              committerName, committerEmail,
                                              date,
                                          }) {
    const author = {
        name: authorName || "steam-f2p-ext[bot]",
        email: authorEmail || "noreply@github.com",
        date,
    };
    const committer = {
        name: committerName || authorName || "steam-f2p-ext[bot]",
        email: committerEmail || authorEmail || "noreply@github.com",
        date,
    };

    const data = await githubFetch ("POST", "/git/commits", {
        message,
        tree: treeSha,
        parents: [parentSha],
        author,
        committer,
        signature,
    });

    await logInfo ("github", `Created signed commit: ${data.sha.slice (0, 7)}`);
    return data.sha;
}

/**
 * Update a branch ref to point to a new commit.
 *
 * @param {string} commitSha - New commit SHA
 * @returns {Promise<void>}
 */
export async function updateRef (commitSha) {
    const cfg = await getConfig ();
    await githubFetch ("PATCH", `/git/refs/heads/${cfg.branch}`, {
        sha: commitSha,
        force: false,
    });
    await logInfo ("github", `Updated ref heads/${cfg.branch} → ${commitSha.slice (0, 7)}`);
}

// ── Base64 helpers ──
// GitHub Contents API requires base64 content.
// We must handle UTF-8 properly.

function encodeBase64 (str) {
    const bytes = new TextEncoder ().encode (str);
    let binary = "";
    for (const b of bytes) {
        binary += String.fromCharCode (b);
    }
    return btoa (binary);
}

function decodeBase64 (b64) {
    const binary = atob (b64);
    const bytes = new Uint8Array (binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt (i);
    }
    return new TextDecoder ().decode (bytes);
}
