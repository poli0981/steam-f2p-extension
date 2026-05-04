// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Service worker entry point.
 * Registers all event listeners and routes messages to handlers.
 *
 * MV3: All imports must be static (no dynamic import()).
 */

import {MSG} from "../shared/constants.js";
import {loadQueue, loadSettings, saveSettings, storageClearAll, updateSettings} from "../shared/storage.js";
import {clearLogs, exportLogsJSON, getLogs, logError, logInfo, logWarn} from "../shared/logger.js";
import {extractAppId} from "../shared/utils.js";
import {addToQueue, getQueueSize, pruneDuplicates, removeFromQueue, restoreEntries, restoreEntry, updateEntry} from "./queue-manager.js";
import {checkDuplicate, clearDedupCache, fetchRemoteAppIds, refreshDedupCache} from "./dedup-checker.js";
import {pushQueue, pushQueueUnsigned} from "./push-handler.js";
import {clearCache as clearGitHubCache} from "./github-api.js";
import {getKeyMeta, importKey, removeKey, validateKey} from "./gpg-signer.js";

// ── Installation ──

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
        await logInfo("settings", "Extension installed — ready for configuration");
    } else if (details.reason === "update") {
        await logInfo("settings", `Extension updated to v${chrome.runtime.getManifest().version}`);
    }
});

// ── Tab-level detected game cache (per tab, volatile) ──
const detectedGames = new Map();

// ── Extension-page tab registry (singleton queue / settings tabs) ──
// Maps extension-relative path → tabId. The sw creates these tabs itself,
// so it knows their ids without needing the "tabs" permission (which would
// be required to use chrome.tabs.query({url}) reliably across windows).
const extensionTabs = new Map();

chrome.tabs.onRemoved.addListener((tabId) => {
    detectedGames.delete(tabId);
    // Drop the tab from the extension registry so the next open request
    // creates a fresh tab instead of trying to focus a dead id.
    for (const [path, id] of extensionTabs.entries()) {
        if (id === tabId) extensionTabs.delete(path);
    }
});

/**
 * Open (or focus) an extension-owned page as a singleton tab.
 *
 * The sw keeps a map of the tabs it has created, so this works across
 * windows and from any trigger (popup click regardless of which tab is
 * active) without needing the broader "tabs" manifest permission.
 *
 * If the cached tabId is stale (tab closed between onRemoved and this
 * call), the update throws and we fall through to creating a fresh tab.
 *
 * @param {string} path - Extension-relative path (e.g. "queue/queue.html")
 * @returns {Promise<chrome.tabs.Tab>}
 */
async function openExtensionPage(path) {
    const existingId = extensionTabs.get(path);
    if (existingId !== undefined) {
        try {
            const tab = await chrome.tabs.update(existingId, { active: true });
            if (tab && tab.windowId !== undefined) {
                await chrome.windows.update(tab.windowId, { focused: true });
            }
            return tab;
        } catch (err) {
            // Tab was removed but onRemoved hasn't fired yet — drop and
            // fall through to create.
            extensionTabs.delete(path);
        }
    }

    const url = chrome.runtime.getURL(path);
    const tab = await chrome.tabs.create({ url });
    if (tab && tab.id !== undefined) {
        extensionTabs.set(path, tab.id);
    }
    return tab;
}

// ── Badge update helper ──

async function updateBadge() {
    const size = await getQueueSize();
    const text = size > 0 ? String(size) : "";
    chrome.action.setBadgeText({text});
    chrome.action.setBadgeBackgroundColor({color: size >= 150 ? "#E74C3C" : "#66C0F4"});
}

// ── Auto-push check ──

async function checkAutoPush() {
    try {
        const settings = await loadSettings();
        const threshold = settings.auto_push_threshold || 0;
        if (threshold <= 0) return;

        const size = await getQueueSize();
        if (size >= threshold) {
            await logInfo("push", `Auto-push triggered: queue (${size}) reached threshold (${threshold})`);
            const result = await pushQueue();
            if (result.ok) {
                await updateBadge();
            }
        }
    } catch (err) {
        await logError("push", `Auto-push check failed: ${err.message || err}`);
    }
}

// ── Message router ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
        .then(sendResponse)
        .catch((err) => {
            logError("sw", `Message handler error: ${err.message}`, {type: message.type});
            sendResponse({ok: false, error: err.message});
        });
    return true;
});

async function handleMessage(message, sender) {
    const {type, data} = message;

    switch (type) {
        // ── Content script: game detected ──
        case MSG.GAME_DETECTED: {
            const tabId = sender.tab?.id;
            if (tabId && data) {
                detectedGames.set(tabId, data);
            }
            return {ok: true};
        }

        // ── Popup: get detected game for current tab ──
        case "GET_DETECTED_GAME": {
            const tabId = data?.tabId;
            const game = tabId ? detectedGames.get(tabId) : null;
            return {ok: true, data: game || null};
        }

        // ── Queue operations ──
        case MSG.ADD_TO_QUEUE: {
            const result = await addToQueue(data);
            await updateBadge();
            if (result.ok) {
                checkAutoPush(); // Fire-and-forget
            }
            return result;
        }

        case MSG.REMOVE_FROM_QUEUE: {
            const result = await removeFromQueue(data?.appid);
            await updateBadge();
            return result;
        }

        case MSG.RESTORE_ENTRY: {
            // Single-entry or batch restore depending on payload shape.
            const result = Array.isArray(data?.entries)
                ? await restoreEntries(data.entries)
                : await restoreEntry(data?.entry);
            await updateBadge();
            return result;
        }

        case MSG.UPDATE_ENTRY: {
            const result = await updateEntry(data?.appid, data?.fields);
            return result;
        }

        case MSG.GET_QUEUE: {
            const queue = await loadQueue();
            return {ok: true, data: queue};
        }

        case MSG.GET_QUEUE_SIZE: {
            const size = await getQueueSize();
            return {ok: true, data: size};
        }

        // ── Push ──
        case MSG.PUSH_QUEUE: {
            const result = await pushQueue(data || {});
            await updateBadge();
            return result;
        }

        case MSG.PUSH_QUEUE_UNSIGNED: {
            const result = await pushQueueUnsigned(data || {});
            await updateBadge();
            return result;
        }

        // ── GPG key management ──
        case MSG.GPG_VALIDATE_KEY: {
            const result = await validateKey(data?.armoredKey);
            return {ok: true, data: result};
        }

        case MSG.GPG_IMPORT_KEY: {
            const result = await importKey(data?.armoredKey, data?.passphrase);
            return result;
        }

        case MSG.GPG_GET_KEY_META: {
            const meta = await getKeyMeta();
            return {ok: true, data: meta};
        }

        case MSG.GPG_REMOVE_KEY: {
            await removeKey();
            return {ok: true};
        }

        // ── Duplicate check (remote + local) ──
        case MSG.CHECK_DUPLICATE: {
            const appid = data?.appid;
            if (!appid) return {ok: true, data: {isDuplicate: false, source: null}};

            try {
                const dup = await checkDuplicate(appid);
                return {ok: true, data: dup};
            } catch (err) {
                // If remote fails, fall back to local-only check
                const queue = await loadQueue();
                const inQueue = queue.some((g) => extractAppId(g.link) === appid);
                return {
                    ok: true,
                    data: {
                        isDuplicate: inQueue,
                        source: inQueue ? "queue" : null,
                        warning: "Remote check failed — local only",
                    },
                };
            }
        }

        // ── Cache refresh ──
        case MSG.REFRESH_CACHE: {
            try {
                clearGitHubCache();
                const count = await refreshDedupCache();

                // Auto-prune queue against the freshly-fetched master set when enabled
                let pruned = null;
                const settings = await loadSettings();
                if (settings.auto_prune_queue) {
                    const set = await fetchRemoteAppIds(false); // hits the warm in-memory cache
                    pruned = await pruneDuplicates(set);
                    if (pruned.removed.length > 0) await updateBadge();
                }

                return {ok: true, data: {appidCount: count, pruned}};
            } catch (err) {
                return {ok: false, error: err.message || "Cache refresh failed"};
            }
        }

        // ── Prune queue duplicates against master data ──
        case MSG.PRUNE_QUEUE_DUPLICATES: {
            try {
                const set = await fetchRemoteAppIds(!!data?.forceRefresh);
                const result = await pruneDuplicates(set);
                if (result.removed.length > 0) await updateBadge();
                return {ok: true, data: result};
            } catch (err) {
                return {ok: false, error: err.message || "Prune failed"};
            }
        }

        // ── Settings ──
        case MSG.GET_SETTINGS: {
            const settings = await loadSettings();
            return {ok: true, data: settings};
        }

        case MSG.SAVE_SETTINGS: {
            await saveSettings(data);
            await logInfo("settings", "Settings saved");
            return {ok: true};
        }

        case MSG.UPDATE_SETTINGS: {
            if (!data || typeof data !== "object" || Array.isArray(data)) {
                return {ok: false, error: "No partial settings object provided"};
            }
            const updated = await updateSettings(data);
            await logInfo("settings", "Settings partially updated", {keys: Object.keys(data)});
            return {ok: true, data: updated};
        }

        // ── Logging ──
        case MSG.GET_LOGS: {
            const logs = await getLogs(data || {});
            return {ok: true, data: logs};
        }

        case MSG.EXPORT_LOGS: {
            const json = await exportLogsJSON();
            return {ok: true, data: json};
        }

        case MSG.CLEAR_LOGS: {
            await clearLogs();
            await logInfo("settings", "Logs cleared");
            return {ok: true};
        }

        // ── Singleton tab open (Queue / Settings) ──
        case MSG.OPEN_EXTENSION_PAGE: {
            const path = data?.path;
            if (!path || typeof path !== "string") {
                return { ok: false, error: "No path provided" };
            }
            try {
                const tab = await openExtensionPage(path);
                return { ok: true, data: { tabId: tab?.id ?? null } };
            } catch (err) {
                await logError("sw", `openExtensionPage failed: ${err.message || err}`, { path });
                return { ok: false, error: err.message || "Failed to open tab" };
            }
        }

        // ── Reset ──
        case MSG.RESET_EXTENSION: {
            await logWarn("settings", "Extension reset initiated");
            await storageClearAll();
            detectedGames.clear();
            extensionTabs.clear();
            clearDedupCache();
            clearGitHubCache();
            await updateBadge();
            return {ok: true};
        }

        default:
            logWarn("sw", `Unknown message type: ${type}`);
            return {ok: false, error: `Unknown message type: ${type}`};
    }
}

// ── Initialize badge on startup ──
updateBadge();
