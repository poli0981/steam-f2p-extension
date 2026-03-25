/**
 * Deduplication checker.
 *
 * Fetches data.jsonl + temp_info.jsonl from GitHub, extracts all known appids,
 * and provides O(1) duplicate lookups. Results are cached with configurable TTL.
 *
 * Also checks against the local queue for a complete picture.
 */

import {REPO_DATA_PATH, REPO_TEMP_PATH,} from "../shared/constants.js";
import {loadCachedAppIds, loadQueue, loadSettings, saveCachedAppIds,} from "../shared/storage.js";
import {extractAppId} from "../shared/utils.js";
import {logDebug, logInfo, logWarn} from "../shared/logger.js";
import {getFileContent} from "./github-api.js";

// ── In-memory set for fast lookups ──
let cachedSet = null;
let cachedAt = 0;

/**
 * Extract all appids from a JSONL string.
 * Each line is a JSON object with a "link" field containing a Steam URL.
 *
 * @param {string} jsonlContent - Raw JSONL file content
 * @returns {string[]} Array of appid strings
 */
function extractAppIdsFromJSONL (jsonlContent) {
    if (!jsonlContent || !jsonlContent.trim ()) return [];

    const appids = [];
    const lines = jsonlContent.split ("\n");

    for (const line of lines) {
        const trimmed = line.trim ();
        if (!trimmed) continue;

        try {
            const obj = JSON.parse (trimmed);
            const link = obj.link || "";
            const appid = extractAppId (link);
            if (appid) {
                appids.push (appid);
            }
        }
        catch {
            // Skip malformed lines (common in partial writes)
        }
    }

    return appids;
}

/**
 * Fetch all known appids from the remote repository.
 * Fetches both data.jsonl (main store) and temp_info.jsonl (pending ingest).
 *
 * @param {boolean} [forceRefresh=false] - Bypass cache
 * @returns {Promise<Set<string>>} Set of known appid strings
 */
export async function fetchRemoteAppIds (forceRefresh = false) {
    const settings = await loadSettings ();
    const ttlMs = (
                      settings.cache_ttl_minutes || 5
                  ) * 60 * 1000;

    // Check in-memory cache first
    if (!forceRefresh && cachedSet && Date.now () - cachedAt < ttlMs) {
        await logDebug (
            "dedup",
            `Using cached appid set (${cachedSet.size} entries)`,
        );
        return cachedSet;
    }

    // Check storage cache (survives service worker restart)
    if (!forceRefresh) {
        const stored = await loadCachedAppIds ();
        if (stored && stored.fetched_at) {
            const age = Date.now () - new Date (stored.fetched_at).getTime ();
            if (age < ttlMs) {
                cachedSet = new Set (stored.appids);
                cachedAt = Date.now ();
                await logDebug (
                    "dedup",
                    `Loaded appid set from storage (${cachedSet.size} entries)`,
                );
                return cachedSet;
            }
        }
    }

    // Fetch fresh data from GitHub
    await logInfo ("dedup", "Fetching remote data for deduplication...");

    const allAppIds = [];

    // 1) data.jsonl — main data store
    try {
        const dataFile = await getFileContent (REPO_DATA_PATH, {
            useCache: !forceRefresh,
            allowMissing: true,
        });
        if (dataFile) {
            const ids = extractAppIdsFromJSONL (dataFile.content);
            allAppIds.push (...ids);
            await logDebug ("dedup", `data.jsonl: ${ids.length} appids`);
        }
    }
    catch (err) {
        await logWarn ("dedup", `Failed to fetch data.jsonl: ${err.message || err}`);
        // Continue — temp_info might still work
    }

    // 2) temp_info.jsonl — pending ingest queue
    try {
        const tempFile = await getFileContent (REPO_TEMP_PATH, {
            useCache: !forceRefresh,
            allowMissing: true,
        });
        if (tempFile && tempFile.content.trim ()) {
            const ids = extractAppIdsFromJSONL (tempFile.content);
            allAppIds.push (...ids);
            await logDebug ("dedup", `temp_info.jsonl: ${ids.length} appids`);
        }
    }
    catch (err) {
        await logWarn (
            "dedup",
            `Failed to fetch temp_info.jsonl: ${err.message || err}`,
        );
    }

    // Build set
    cachedSet = new Set (allAppIds);
    cachedAt = Date.now ();

    // Persist to storage for service worker restart resilience
    await saveCachedAppIds (Array.from (cachedSet));

    await logInfo (
        "dedup",
        `Dedup cache refreshed: ${cachedSet.size} known appids`,
    );
    return cachedSet;
}

/**
 * Check if an appid is a duplicate.
 * Checks: remote data → remote temp → local queue.
 *
 * @param {string} appid - Steam appid to check
 * @param {boolean} [forceRefresh=false] - Force fresh remote fetch
 * @returns {Promise<{isDuplicate: boolean, source: string|null}>}
 */
export async function checkDuplicate (appid, forceRefresh = false) {
    if (!appid) {
        return {isDuplicate: false, source: null};
    }

    // 1) Check local queue first (instant, always fresh)
    const queue = await loadQueue ();
    const inQueue = queue.some ((g) => extractAppId (g.link) === appid);
    if (inQueue) {
        return {isDuplicate: true, source: "queue"};
    }

    // 2) Check remote data
    try {
        const remoteSet = await fetchRemoteAppIds (forceRefresh);
        if (remoteSet.has (appid)) {
            return {isDuplicate: true, source: "remote"};
        }
    }
    catch (err) {
        // If remote check fails, we can't confirm — log but don't block
        await logWarn (
            "dedup",
            `Remote dedup check failed: ${err.message || err}. Allowing add.`,
        );
    }

    return {isDuplicate: false, source: null};
}

/**
 * Force refresh the dedup cache.
 * Called after a successful push or when user clicks "Refresh Cache".
 *
 * @returns {Promise<number>} Number of known appids after refresh
 */
export async function refreshDedupCache () {
    const set = await fetchRemoteAppIds (true);
    return set.size;
}

/**
 * Clear the in-memory dedup cache.
 * Storage cache will be re-read on next check.
 */
export function clearDedupCache () {
    cachedSet = null;
    cachedAt = 0;
}
