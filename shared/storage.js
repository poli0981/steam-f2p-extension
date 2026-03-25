// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Chrome storage wrapper.
 * Typed get/set with defaults, namespaced keys, bulk operations.
 */

import {DEFAULT_SETTINGS, STORAGE_KEYS} from "./constants.js";

/**
 * Get a value from chrome.storage.local.
 * @param {string} key
 * @param {*} fallback - Default value if key doesn't exist
 * @returns {Promise<*>}
 */
export async function storageGet (key, fallback = null) {
    try {
        const result = await chrome.storage.local.get (key);
        return result[key] !== undefined ? result[key] : fallback;
    }
    catch (err) {
        console.error (`[storage] get("${key}") failed:`, err);
        return fallback;
    }
}

/**
 * Set a value in chrome.storage.local.
 * @param {string} key
 * @param {*} value
 * @returns {Promise<void>}
 */
export async function storageSet (key, value) {
    try {
        await chrome.storage.local.set ({[key]: value});
    }
    catch (err) {
        console.error (`[storage] set("${key}") failed:`, err);
        throw err;
    }
}

/**
 * Remove a key from chrome.storage.local.
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function storageRemove (key) {
    try {
        await chrome.storage.local.remove (key);
    }
    catch (err) {
        console.error (`[storage] remove("${key}") failed:`, err);
    }
}

/**
 * Clear all chrome.storage.local data.
 * @returns {Promise<void>}
 */
export async function storageClearAll () {
    try {
        await chrome.storage.local.clear ();
    }
    catch (err) {
        console.error ("[storage] clearAll failed:", err);
        throw err;
    }
}

// ── Settings helpers ──

/**
 * Load settings, merging with defaults for any missing keys.
 * @returns {Promise<object>}
 */
export async function loadSettings () {
    const stored = await storageGet (STORAGE_KEYS.SETTINGS, {});
    return {...DEFAULT_SETTINGS, ...stored};
}

/**
 * Save settings (full replace).
 * @param {object} settings
 * @returns {Promise<void>}
 */
export async function saveSettings (settings) {
    await storageSet (STORAGE_KEYS.SETTINGS, settings);
}

/**
 * Update specific settings fields (merge).
 * @param {object} partial
 * @returns {Promise<object>} Updated full settings
 */
export async function updateSettings (partial) {
    const current = await loadSettings ();
    const updated = {...current, ...partial};
    await saveSettings (updated);
    return updated;
}

// ── Queue helpers ──

/**
 * Load the queue array.
 * @returns {Promise<Array>}
 */
export async function loadQueue () {
    return storageGet (STORAGE_KEYS.QUEUE, []);
}

/**
 * Save the queue array (full replace).
 * @param {Array} queue
 * @returns {Promise<void>}
 */
export async function saveQueue (queue) {
    await storageSet (STORAGE_KEYS.QUEUE, queue);
}

// ── Cache helpers ──

/**
 * Load cached appid set with metadata.
 * @returns {Promise<{appids: string[], fetched_at: string}|null>}
 */
export async function loadCachedAppIds () {
    return storageGet (STORAGE_KEYS.CACHE_APPIDS, null);
}

/**
 * Save cached appid set.
 * @param {string[]} appids
 * @returns {Promise<void>}
 */
export async function saveCachedAppIds (appids) {
    await storageSet (STORAGE_KEYS.CACHE_APPIDS, {
        appids,
        fetched_at: new Date ().toISOString (),
    });
}
