// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Tab-singleton helper.
 *
 * Chrome doesn't natively dedupe tabs pointing at the same extension page.
 * openExtensionPage(path) looks up an existing tab for the given extension
 * URL; if found, it activates that tab (and focuses its window). Otherwise
 * it opens a new tab.
 *
 * Used by the popup to keep a single Queue tab and a single Settings tab
 * across repeated clicks.
 */

/**
 * Open an extension-owned page, focusing any existing tab instead of creating
 * a new one.
 *
 * @param {string} path - Extension-relative path (e.g. "queue/queue.html")
 * @returns {Promise<chrome.tabs.Tab>} The focused or newly created tab
 */
export async function openExtensionPage(path) {
    const url = chrome.runtime.getURL(path);

    try {
        const matches = await chrome.tabs.query({ url });
        const existing = matches && matches[0];

        if (existing) {
            await chrome.tabs.update(existing.id, { active: true });
            if (existing.windowId !== undefined) {
                await chrome.windows.update(existing.windowId, { focused: true });
            }
            return existing;
        }
    } catch (err) {
        // Fall through to create — query can fail if the url pattern is
        // momentarily blocked by Chrome (rare), we shouldn't deny the user
        // opening the page for that reason.
        console.warn("[tab-manager] query failed, opening new tab:", err);
    }

    return chrome.tabs.create({ url });
}
