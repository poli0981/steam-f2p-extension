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

import {AUTO_COLLECT_COOLDOWN_MS, ERROR_CODE, MSG, SESSION_KEY_COOLDOWN_PREFIX} from "../shared/constants.js";
import {loadQueue, loadSettings, saveSettings, storageClearAll, updateSettings} from "../shared/storage.js";
import {clearLogs, exportLogsJSON, getLogs, logError, logInfo, logWarn} from "../shared/logger.js";
import {extractAppId} from "../shared/utils.js";
import {addToQueue, getQueueSize, pruneDuplicates, removeFromQueue, restoreEntries, restoreEntry, updateEntry} from "./queue-manager.js";
import {checkDuplicate, clearDedupCache, fetchRemoteAppIds, refreshDedupCache} from "./dedup-checker.js";
import {pushQueue, pushQueueUnsigned} from "./push-handler.js";
import {clearCache as clearGitHubCache} from "./github-api.js";
import {getKeyMeta, importKey, removeKey, validateKey} from "./gpg-signer.js";
import {getNotifyText, resolveNotifyLang} from "../shared/notification-text.js";

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

// ── Auto-collect cooldown (v1.16.0) ──
// chrome.storage.session is volatile; entries clear on browser restart,
// which is the right TTL behaviour for "don't spam toasts on rapid
// refresh within a single session". A nominal AUTO_COLLECT_COOLDOWN_MS
// also lets the user re-trigger after a meaningful gap.

async function isInAutoCollectCooldown(appid) {
    if (!appid) return false;
    const key = SESSION_KEY_COOLDOWN_PREFIX + appid;
    try {
        const r = await chrome.storage.session.get(key);
        const ts = r[key];
        return typeof ts === "number" && (Date.now() - ts) < AUTO_COLLECT_COOLDOWN_MS;
    } catch {
        return false;
    }
}

async function markAutoCollectCooldown(appid) {
    if (!appid) return;
    try {
        await chrome.storage.session.set({
            [SESSION_KEY_COOLDOWN_PREFIX + appid]: Date.now(),
        });
    } catch (err) {
        await logWarn("sw", `Auto-collect cooldown set failed for ${appid}: ${err.message || err}`);
    }
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

// ── App-type lookup (v2.6.1) ──
// A Steam search row can't reveal whether an app is a game, mod, video,
// DLC, soundtrack, or demo — a free mod looks identical to a free game.
// The search content script asks here before offering to queue a "free"
// row; only `type: "game"` is queueable. Uses Steam's appdetails API
// (same origin as the store — already covered by host_permissions).
// Cached per appid for the worker's lifetime (an app's type is stable).
const appTypeCache = new Map(); // appid -> {type, is_free}

async function fetchAppType(appid) {
    if (appTypeCache.has(appid)) return appTypeCache.get(appid);
    try {
        const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appid)}&filters=basic&l=english`;
        const resp = await fetch(url);
        if (resp.ok) {
            const json = await resp.json();
            const entry = json && json[appid];
            if (entry && entry.success && entry.data) {
                const result = {type: entry.data.type || null, is_free: !!entry.data.is_free};
                appTypeCache.set(appid, result); // cache only confirmed results
                return result;
            }
        }
    } catch (err) {
        await logWarn("sw", `appdetails type check failed for ${appid}: ${err.message || err}`);
    }
    // Fail open (unknown type → treated as a game by the caller). Not cached,
    // so a later hover retries.
    return {type: null, is_free: null};
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

        // ── App type (v2.6.1) — search-page non-game guard ──
        case MSG.CHECK_APP_TYPE: {
            const appid = data?.appid;
            if (!appid) return {ok: true, data: {type: null}};
            const r = await fetchAppType(String(appid));
            return {ok: true, data: r};
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

        // ── Auto-collect from content script (v1.16.0) ──
        // Called by detector.js after every page scan. Settings gate
        // is checked here (not in the content script) so the toggle
        // applies live without a content-script reload. Returns a
        // structured `action` plus a pre-localized `message` for the
        // in-page toast; `silent: true` tells the content script to
        // skip the toast (cooldown, disabled, or sub-toggle off).
        case MSG.AUTO_ADD_FROM_PAGE: {
            const settings = await loadSettings();

            // v2.5.0: this handler serves both the app-page detector
            // (source "page", the default) and the search-page hover
            // feature (source "search"). Each path has its own opt-in gate.
            const source = data?.source === "search" ? "search" : "page";
            const trigger = data?.trigger || "auto";
            if (source === "search") {
                if (!settings.search_detect) return {ok: true, action: "disabled", silent: true};
                // Hover-triggered adds need the auto-add sub-toggle; an
                // explicit Add-button click (trigger "click") is always allowed.
                if (trigger === "hover" && !settings.search_autoadd_on_hover) {
                    return {ok: true, action: "disabled", silent: true};
                }
            } else if (!settings.auto_collect) {
                return {ok: true, action: "disabled", silent: true};
            }

            const gameData = data?.gameData;
            const cls = data?.classification || {};
            if (!gameData || !gameData.appid) {
                return {ok: false, error: "Missing gameData or appid"};
            }

            const appid = gameData.appid;
            // Explicit clicks bypass the session cooldown so the user always
            // gets feedback; auto (page) and hover (search) adds respect it.
            if (trigger !== "click" && await isInAutoCollectCooldown(appid)) {
                return {ok: true, action: "cooldown", silent: true};
            }

            const lang = resolveNotifyLang(settings.notify_lang);
            const t = getNotifyText(lang);
            const name = gameData.name || "";

            // DLC / demo / playtest — never enqueue, optional toast.
            if (cls.is_dlc) {
                if (!settings.notify_dlc_demo) return {ok: true, action: "dlc", silent: true};
                await markAutoCollectCooldown(appid);
                return {ok: true, action: "dlc", message: t.dlc(name, appid), toastType: "info"};
            }
            if (cls.is_demo) {
                if (!settings.notify_dlc_demo) return {ok: true, action: "demo", silent: true};
                await markAutoCollectCooldown(appid);
                return {ok: true, action: "demo", message: t.demo(name, appid), toastType: "info"};
            }
            if (cls.is_playtest) {
                if (!settings.notify_dlc_demo) return {ok: true, action: "playtest", silent: true};
                await markAutoCollectCooldown(appid);
                return {ok: true, action: "playtest", message: t.playtest(name, appid), toastType: "info"};
            }

            // Delisted / no longer available on the Steam store — never
            // enqueue. Gated by the same notify_dlc_demo toggle as the
            // other "this page isn't queueable" outcomes.
            if (cls.is_unavailable) {
                if (!settings.notify_dlc_demo) return {ok: true, action: "unavailable", silent: true};
                await markAutoCollectCooldown(appid);
                return {ok: true, action: "unavailable", message: t.unavailable(name, appid), toastType: "warning"};
            }

            // Coming soon / not yet released — never enqueue. Checked
            // before the paid gate so a pre-purchase page reads as
            // "coming soon" rather than "paid".
            if (cls.is_coming_soon) {
                if (!settings.notify_dlc_demo) return {ok: true, action: "coming_soon", silent: true};
                await markAutoCollectCooldown(appid);
                return {ok: true, action: "coming_soon", message: t.comingSoon(name, appid), toastType: "warning"};
            }

            // Community-made mod — not a standalone game, never enqueue.
            // (A mod page still advertises "Free To Play", so this guard
            // must run before the free path below.)
            if (cls.is_mod) {
                if (!settings.notify_dlc_demo) return {ok: true, action: "mod", silent: true};
                await markAutoCollectCooldown(appid);
                return {ok: true, action: "mod", message: t.mod(name, appid), toastType: "info"};
            }

            // Steam Video product — not a game, never enqueue.
            if (cls.is_video) {
                if (!settings.notify_dlc_demo) return {ok: true, action: "video", silent: true};
                await markAutoCollectCooldown(appid);
                return {ok: true, action: "video", message: t.video(name, appid), toastType: "info"};
            }

            // Paid — never enqueue, optional toast.
            if (cls.free_type === "paid") {
                if (!settings.notify_not_free) return {ok: true, action: "not_free", silent: true};
                await markAutoCollectCooldown(appid);
                return {ok: true, action: "not_free", message: t.notFree(name, appid), toastType: "warning"};
            }

            // Free — try to enqueue.
            if (cls.free_type === "f2p" || cls.free_type === "free_game") {
                // v1.16.1: also check the remote master DB (sharded data_NNN.jsonl
                // discovered via data/index.json) before enqueue. Uses the existing
                // 5-min dedup cache; checkDuplicate() silently fails open on remote
                // fetch errors (returns isDuplicate:false with a warning field), so a
                // cold cache + network failure falls through to the local-only path.
                const dup = await checkDuplicate(appid);
                if (dup.isDuplicate && dup.source === "queue") {
                    if (!settings.notify_duplicate) return {ok: true, action: "duplicate", silent: true};
                    await markAutoCollectCooldown(appid);
                    return {ok: true, action: "duplicate", message: t.duplicate(name, appid), toastType: "info"};
                }
                if (dup.isDuplicate && dup.source === "remote") {
                    await logInfo("dedup", `Auto-collect skipped (in master): ${appid}`, {appid});
                    if (!settings.notify_duplicate) return {ok: true, action: "master_duplicate", silent: true};
                    await markAutoCollectCooldown(appid);
                    return {
                        ok: true,
                        action: "master_duplicate",
                        message: t.masterDuplicate(name, appid),
                        toastType: "info",
                    };
                }

                const result = await addToQueue(gameData);
                await updateBadge();

                if (result.ok) {
                    // Auto-push respects the user's existing threshold;
                    // auto-collect does NOT bypass that knob.
                    checkAutoPush();
                    if (!settings.notify_added) return {ok: true, action: "added", silent: true};
                    await markAutoCollectCooldown(appid);
                    await logInfo("queue", `Auto-collected: ${name || appid}`, {appid});
                    return {ok: true, action: "added", message: t.added(name, appid), toastType: "success"};
                }

                if (result.error_code === ERROR_CODE.QUEUE_FULL) {
                    if (!settings.notify_queue_full) return {ok: true, action: "queue_full", silent: true};
                    await markAutoCollectCooldown(appid);
                    return {
                        ok: true,
                        action: "queue_full",
                        message: t.queueFull(),
                        toastType: "error",
                        link: {label: t.openQueue, action: "open_queue"},
                    };
                }

                if (result.error_code === ERROR_CODE.DUPLICATE) {
                    if (!settings.notify_duplicate) return {ok: true, action: "duplicate", silent: true};
                    await markAutoCollectCooldown(appid);
                    return {ok: true, action: "duplicate", message: t.duplicate(name, appid), toastType: "info"};
                }

                // Any other unexpected failure — log and stay silent.
                await logWarn("queue", `Auto-collect rejected: ${result.error || "unknown"}`, {appid});
                return {ok: false, action: "rejected", silent: true, error: result.error};
            }

            // Unknown / indeterminate classification — stay silent.
            return {ok: true, action: "unknown_type", silent: true};
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
