// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Shared utility functions.
 * Link normalization, appid extraction, time formatting.
 */

import {APPID_RE, STEAM_STORE_URL} from "./constants.js";

/**
 * Extract numeric appid from a Steam store URL.
 * @param {string} link
 * @returns {string|null}
 */
export function extractAppId (link) {
    if (!link) return null;
    const m = link.match (APPID_RE);
    return m ? m[1] : null;
}

/**
 * Normalize a Steam link to canonical form.
 * Accepts: full URL, short URL, bare appid.
 * @param {string} raw
 * @returns {string|null} Canonical URL or null
 */
export function normalizeLink (raw) {
    if (!raw) return null;
    raw = raw.trim ()
             .replace (/\/+$/, "");

    // Bare number
    if (/^\d+$/.test (raw)) {
        return `${STEAM_STORE_URL}${raw}/`;
    }

    const appid = extractAppId (raw);
    if (appid) {
        return `${STEAM_STORE_URL}${appid}/`;
    }

    return null;
}

/**
 * Get current UTC timestamp in ISO format.
 * @returns {string}
 */
export function nowISO () {
    return new Date ().toISOString ()
                      .replace (/\.\d{3}Z$/, "Z");
}

/**
 * Format a timestamp for display (short form).
 * @param {string} iso - ISO timestamp
 * @returns {string}
 */
export function formatTime (iso) {
    if (!iso) return "—";
    try {
        const d = new Date (iso);
        const pad = (n) => String (n)
            .padStart (2, "0");
        return `${d.getFullYear ()}-${pad (d.getMonth () + 1)}-${pad (d.getDate ())} ${pad (d.getHours ())}:${pad (d.getMinutes ())}`;
    }
    catch {
        return iso;
    }
}

/**
 * Truncate a string with ellipsis.
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
export function truncate (str, max = 50) {
    if (!str || str.length <= max) return str || "";
    return str.slice (0, max - 3) + "...";
}

/**
 * Sanitize a string for safe DOM insertion.
 * @param {string} str
 * @returns {string}
 */
export function sanitize (str) {
    if (!str) return "";
    const div = document.createElement ("div");
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Simple debounce.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
export function debounce (fn, ms = 300) {
    let timer;
    return (...args) => {
        clearTimeout (timer);
        timer = setTimeout (() => fn (...args), ms);
    };
}

/**
 * Create a game entry skeleton from detected data.
 * @param {object} detected - Data from content script
 * @returns {object}
 */
export function makeQueueEntry (detected) {
    return {
        link: normalizeLink (detected.link || detected.url || ""),
        name: detected.name || "",
        genre: detected.genre || "",
        developer: detected.developer || "",
        header_image: detected.header_image || "",
        release_date: detected.release_date || "",
        // Auto-detected or defaults
        type_game: detected.type_game || "offline",
        anti_cheat: detected.anti_cheat || "-",
        notes: "",
        safe: "?",
        // Metadata
        added_at: nowISO (),
    };
}
