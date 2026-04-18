// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Shared theme applier.
 *
 * Reads `settings.ui_theme` ("system" | "dark" | "light") from storage and
 * applies it to <html> via the `data-theme` attribute. Listens to:
 *   - chrome.storage.onChanged — for cross-tab / cross-page sync
 *   - window.matchMedia("(prefers-color-scheme: light)") — so "system"
 *     mode reacts to the user flipping their OS appearance
 *
 * CSS in shared/theme.css handles both triggers:
 *   - @media (prefers-color-scheme: light) + :root:not([data-theme="dark"])
 *   - :root[data-theme="light"]
 *
 * So "system" leaves data-theme unset (the @media query controls); "dark"
 * sets data-theme="dark" (blocks the OS-light pref leaking in); "light"
 * sets data-theme="light" (forces light tokens regardless of OS).
 */

import {STORAGE_KEYS} from "./constants.js";

const VALID = new Set(["system", "dark", "light"]);

let currentSetting = "system";
let mediaListenerAttached = false;
let storageListenerAttached = false;

/**
 * Apply the effective theme to <html>. Public so callers that already
 * have the value (e.g. the settings page after a user click) can update
 * the UI instantly without waiting for the storage round-trip.
 *
 * @param {"system"|"dark"|"light"} setting
 */
export function applyTheme(setting) {
    const s = VALID.has(setting) ? setting : "system";
    currentSetting = s;

    const html = document.documentElement;
    if (s === "system") {
        html.removeAttribute("data-theme");
    } else {
        html.setAttribute("data-theme", s);
    }
}

/**
 * Initialize theme sync for the current page.
 *   1. Read ui_theme from chrome.storage.local.settings
 *   2. Apply it
 *   3. Wire cross-tab sync and OS-preference change listeners
 *
 * Idempotent — calling twice won't double-attach listeners.
 *
 * @returns {Promise<"system"|"dark"|"light">} The theme that was applied
 */
export async function initThemeSync() {
    let setting = "system";
    try {
        const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
        const stored = result && result[STORAGE_KEYS.SETTINGS];
        if (stored && VALID.has(stored.ui_theme)) {
            setting = stored.ui_theme;
        }
    } catch (err) {
        console.warn("[theme-applier] failed to read settings:", err);
    }

    applyTheme(setting);

    // OS-preference listener — only matters while in "system" mode
    if (!mediaListenerAttached && typeof window !== "undefined" && window.matchMedia) {
        const mq = window.matchMedia("(prefers-color-scheme: light)");
        const handler = () => {
            if (currentSetting === "system") applyTheme("system");
        };
        // addEventListener is the modern API; some older Chromium builds only
        // expose deprecated addListener. Either works for our target.
        if (typeof mq.addEventListener === "function") {
            mq.addEventListener("change", handler);
        } else if (typeof mq.addListener === "function") {
            mq.addListener(handler);
        }
        mediaListenerAttached = true;
    }

    // Cross-tab / cross-page storage sync
    if (!storageListenerAttached && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== "local") return;
            const settingsChange = changes[STORAGE_KEYS.SETTINGS];
            if (!settingsChange) return;
            const next = settingsChange.newValue?.ui_theme;
            const normalised = VALID.has(next) ? next : "system";
            if (normalised !== currentSetting) {
                applyTheme(normalised);
            }
        });
        storageListenerAttached = true;
    }

    return setting;
}
