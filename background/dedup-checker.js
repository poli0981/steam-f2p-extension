// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Deduplication checker.
 *
 * Reads data/index.json to discover data files (data_001.jsonl, data_002.jsonl, ...),
 * fetches each in parallel, and also fetches temp_info.jsonl for pending entries.
 * Extracts all known appids and provides O(1) duplicate lookups.
 * Results are cached with configurable TTL.
 *
 * For files > 1 MB the Contents API returns metadata but no content;
 * fetchFileContent() handles this via raw.githubusercontent.com fallback.
 */

import { REPO_INDEX_PATH, REPO_DATA_DIR, REPO_TEMP_PATH } from "../shared/constants.js";
import { loadQueue, loadCachedAppIds, saveCachedAppIds, loadSettings } from "../shared/storage.js";
import { extractAppId } from "../shared/utils.js";
import { logDebug, logInfo, logWarn } from "../shared/logger.js";
import { getFileContent, getRawFileContent } from "./github-api.js";

// ── In-memory set for fast lookups ──
let cachedSet = null;
let cachedAt = 0;

/**
 * Extract all appids from a JSONL string.
 * @param {string} jsonlContent - Raw JSONL file content
 * @returns {string[]} Array of appid strings
 */
function extractAppIdsFromJSONL(jsonlContent) {
    if (!jsonlContent || !jsonlContent.trim()) return [];

    const appids = [];
    const lines = jsonlContent.split("\n");

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
            const obj = JSON.parse(trimmed);
            const link = obj.link || "";
            const appid = extractAppId(link);
            if (appid) appids.push(appid);
        } catch {
            // Skip malformed lines
        }
    }

    return appids;
}

/**
 * Fetch file content with automatic fallback for large files (> 1 MB).
 *
 * Strategy:
 *   1. Try Contents API (getFileContent) — returns base64 for ≤ 1 MB
 *   2. If content is empty but file exists → file is > 1 MB → fetch raw
 *   3. If Contents API 404 → try raw download as final fallback
 *
 * @param {string} path - File path in repo
 * @param {boolean} forceRefresh - Bypass cache
 * @returns {Promise<string>} File content as UTF-8 string, or "" if not found
 */
async function fetchFileContent(path, forceRefresh) {
    try {
        const file = await getFileContent(path, {
            useCache: !forceRefresh,
            allowMissing: true,
        });

        if (file && file.content && file.content.trim()) {
            // File ≤ 1 MB — Contents API returned base64 content
            return file.content;
        }

        if (file && (!file.content || !file.content.trim())) {
            // File exists (has sha) but content is empty → too large for Contents API
            await logInfo("dedup",
                          `${path}: no base64 content from Contents API (file > 1 MB), fetching raw...`);
            const raw = await getRawFileContent(path);
            if (raw) return raw;
        }

        if (!file) {
            // Contents API returned null (404 with allowMissing)
            // Try raw download as fallback — Contents API sometimes 404s for large files
            try {
                const raw = await getRawFileContent(path);
                if (raw) {
                    await logDebug("dedup", `${path}: found via raw download after Contents API miss`);
                    return raw;
                }
            } catch {
                // Genuinely doesn't exist
            }
        }
    } catch (err) {
        if (err.type === "auth") throw err;

        // Contents API failed — try raw download
        await logWarn("dedup", `Contents API failed for ${path}: ${err.message}. Trying raw...`);
        try {
            const raw = await getRawFileContent(path);
            if (raw) return raw;
        } catch (rawErr) {
            await logWarn("dedup", `Raw download also failed for ${path}: ${rawErr.message || rawErr}`);
        }
    }

    return "";
}

/**
 * Fetch and parse data/index.json to discover data files.
 *
 * @param {boolean} forceRefresh - Bypass cache
 * @returns {Promise<{files: {name: string, count: number}[]}>} Parsed index or empty
 */
async function fetchIndexFile(forceRefresh) {
    try {
        const file = await getFileContent(REPO_INDEX_PATH, {
            useCache: !forceRefresh,
            allowMissing: true,
        });

        if (!file || !file.content || !file.content.trim()) {
            await logWarn("dedup", "data/index.json: not found or empty");
            return { files: [] };
        }

        const index = JSON.parse(file.content);
        await logInfo("dedup", `data/index.json: ${(index.files || []).length} file(s)`);
        return index;
    } catch (err) {
        await logWarn("dedup", `Failed to fetch/parse data/index.json: ${err.message || err}`);
        return { files: [] };
    }
}

/**
 * Fetch all known appids from the remote repository.
 *
 * Reads data/index.json to discover data files, fetches each in parallel,
 * then also fetches scripts/temp_info.jsonl for pending entries.
 *
 * @param {boolean} [forceRefresh=false] - Bypass cache
 * @returns {Promise<Set<string>>} Set of known appid strings
 */
export async function fetchRemoteAppIds(forceRefresh = false) {
    const settings = await loadSettings();
    const ttlMs = (settings.cache_ttl_minutes || 5) * 60 * 1000;

    // Check in-memory cache
    if (!forceRefresh && cachedSet && (Date.now() - cachedAt) < ttlMs) {
        await logDebug("dedup", `Using cached appid set (${cachedSet.size} entries)`);
        return cachedSet;
    }

    // Check storage cache (survives service worker restart)
    if (!forceRefresh) {
        const stored = await loadCachedAppIds();
        if (stored && stored.fetched_at) {
            const age = Date.now() - new Date(stored.fetched_at).getTime();
            if (age < ttlMs) {
                cachedSet = new Set(stored.appids);
                cachedAt = Date.now();
                await logDebug("dedup", `Loaded appid set from storage (${cachedSet.size} entries)`);
                return cachedSet;
            }
        }
    }

    await logInfo("dedup", "Fetching remote data for deduplication...");

    const allAppIds = [];

    // 1) Fetch data/index.json → discover data files
    const index = await fetchIndexFile(forceRefresh);

    if (index.files && index.files.length > 0) {
        // Fetch all data files in parallel
        const results = await Promise.allSettled(
            index.files.map(async (entry) => {
                const path = REPO_DATA_DIR + entry.name;
                const content = await fetchFileContent(path, forceRefresh);
                if (content) {
                    const ids = extractAppIdsFromJSONL(content);
                    await logInfo("dedup",
                                  `${entry.name}: ${ids.length} appids (${(content.length / 1024).toFixed(0)} KB)`);
                    return ids;
                }
                await logWarn("dedup", `${entry.name}: empty or not found`);
                return [];
            })
        );

        for (const result of results) {
            if (result.status === "fulfilled") {
                allAppIds.push(...result.value);
            } else {
                await logWarn("dedup", `Data file fetch failed: ${result.reason?.message || result.reason}`);
            }
        }
    }

    // 2) temp_info.jsonl — pending ingest (usually small)
    try {
        const content = await fetchFileContent(REPO_TEMP_PATH, forceRefresh);
        if (content) {
            const ids = extractAppIdsFromJSONL(content);
            allAppIds.push(...ids);
            await logDebug("dedup", `temp_info.jsonl: ${ids.length} appids`);
        }
    } catch (err) {
        await logWarn("dedup", `Failed to fetch temp_info.jsonl: ${err.message || err}`);
    }

    // Build set
    cachedSet = new Set(allAppIds);
    cachedAt = Date.now();

    // Persist to storage
    await saveCachedAppIds(Array.from(cachedSet));

    await logInfo("dedup", `Dedup cache refreshed: ${cachedSet.size} known appids`);
    return cachedSet;
}

/**
 * Check if an appid is a duplicate.
 * @param {string} appid
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<{isDuplicate: boolean, source: string|null, warning?: string}>}
 */
export async function checkDuplicate(appid, forceRefresh = false) {
    if (!appid) return { isDuplicate: false, source: null };

    // Local queue (instant)
    const queue = await loadQueue();
    const inQueue = queue.some((g) => extractAppId(g.link) === appid);
    if (inQueue) return { isDuplicate: true, source: "queue" };

    // Remote data
    try {
        const remoteSet = await fetchRemoteAppIds(forceRefresh);
        if (remoteSet.has(appid)) return { isDuplicate: true, source: "remote" };
    } catch (err) {
        await logWarn("dedup", `Remote dedup failed: ${err.message || err}. Allowing add.`);
        return { isDuplicate: false, source: null, warning: "Remote check failed — local only" };
    }

    return { isDuplicate: false, source: null };
}

/**
 * Force refresh the dedup cache.
 * @returns {Promise<number>} Number of known appids
 */
export async function refreshDedupCache() {
    const set = await fetchRemoteAppIds(true);
    return set.size;
}

/**
 * Clear in-memory dedup cache.
 */
export function clearDedupCache() {
    cachedSet = null;
    cachedAt = 0;
}
