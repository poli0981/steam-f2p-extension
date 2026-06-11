// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * App-info lookup via Steam's appdetails API.
 *
 * A Steam search row can't reveal whether an app is a game, mod, video,
 * DLC, soundtrack, or demo — a free mod looks identical to a free game —
 * and it carries almost no catalog data. The search content script asks
 * here (CHECK_APP_TYPE) before offering to queue a "free" row; only
 * `type: "game"` is queueable (v2.6.1). The same single request also
 * returns the app's public catalog metadata (description, developers,
 * publishers, genres, categories, release date, supported languages),
 * which enriches a search-sourced queue entry at add time (v2.7.0).
 *
 * Same origin as the store — already covered by host_permissions; only
 * the numeric appid is sent. Cached per appid for the worker's lifetime
 * (catalog data is stable). Failures are NOT cached so a later call
 * retries; callers treat null as "fail open" (unknown type → treated as
 * a game by the gate, enrichment skipped → entry stays lightweight).
 */

import {logWarn} from "../shared/logger.js";

// One request serves both the non-game gate and entry enrichment:
// "basic" already carries type / is_free / short_description /
// supported_languages / header_image; the rest are the optional sections.
const APPDETAILS_FILTERS = "basic,developers,publishers,genres,categories,release_date";

// Mirrors ONLINE_SIGNALS in content/extract-platform.js (which matches the
// app page's category chips + tags; here the same signals are matched
// against appdetails `categories[].description`). Keep the two in sync.
const ONLINE_CATEGORY_SIGNALS = [
    "multi-player", "multiplayer", "online multi-player",
    "online pvp", "online co-op", "cross-platform multiplayer",
    "massively multiplayer", "mmo", "mmorpg",
    "pvp", "battle royale", "lan multiplayer",
];

const appInfoCache = new Map(); // appid -> mapped info object

const NAMED_ENTITIES = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&quot;": "\"", "&apos;": "'", "&nbsp;": " ",
};

/**
 * Decode the handful of HTML entities Steam catalog strings carry
 * (e.g. "Dungeons &amp; Dragons"). Single pass, so an escaped entity
 * like "&amp;lt;" or "&#38;lt;" yields the literal text "&lt;" instead
 * of double-decoding to "<". Out-of-range numeric refs pass through
 * unchanged (fromCodePoint would throw above 0x10FFFF).
 */
function decodeEntities(s) {
    return s.replace(/&(?:#(\d+)|amp|lt|gt|quot|apos|nbsp);/g, (match, code) => {
        if (code === undefined) return NAMED_ENTITIES[match];
        const n = Number(code);
        return n <= 0x10FFFF ? String.fromCodePoint(n) : match;
    });
}

/**
 * Strip markup tags, decode entities, collapse whitespace.
 * Safe on any input — non-strings come back as "".
 */
function sanitizeText(s) {
    if (typeof s !== "string") return "";
    return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Coerce an appdetails string array (developers, publishers) to clean strings. */
function listOfStrings(arr) {
    return Array.isArray(arr) ? arr.map(sanitizeText).filter(Boolean) : [];
}

/** Pull the `description` labels out of appdetails genres/categories arrays. */
function descriptionsOf(arr) {
    return Array.isArray(arr)
        ? arr.map((o) => sanitizeText(o && o.description)).filter(Boolean)
        : [];
}

/**
 * Parse the `supported_languages` HTML string into a clean language list.
 *
 * Input shape: "English<strong>*</strong>, French, Simplified Chinese<br>
 * <strong>*</strong>languages with full audio support" — everything after
 * the first <br> is footnote text; the asterisks mark full-audio support
 * (a distinction the entry schema keeps in language_details, which only
 * the app-page table can fill — so it is dropped here, not approximated).
 *
 * @param {string} html
 * @returns {string[]} e.g. ["English", "French", "Simplified Chinese"]
 */
function parseSupportedLanguages(html) {
    if (typeof html !== "string" || !html) return [];
    const flat = sanitizeText(html.split(/<br/i)[0]).replace(/\*/g, "");
    const seen = new Set();
    const out = [];
    for (const part of flat.split(",")) {
        const lang = part.trim();
        if (!lang) continue;
        // Defensive: catches footnote variants not preceded by <br>.
        if (lang.toLowerCase().includes("languages with full audio")) continue;
        if (seen.has(lang)) continue;
        seen.add(lang);
        out.push(lang);
    }
    return out;
}

/**
 * Map a raw appdetails payload into a queue-entry-shaped info object.
 * Every field defaults to "" / [] — free titles frequently omit sections.
 *
 * tags / language_details / anti_cheat are deliberately NOT mapped:
 * appdetails has genres (not user-voted tags), no per-language subtitle
 * matrix, and no anti-cheat data — approximations must not reach the
 * master DB.
 *
 * @param {object} data - `json[appid].data` from appdetails
 * @returns {object}
 */
function mapAppDetails(data) {
    const genres = descriptionsOf(data.genres);
    const catsLower = descriptionsOf(data.categories).map((c) => c.toLowerCase());

    return {
        type: data.type || null,
        is_free: !!data.is_free,
        name: sanitizeText(data.name),
        description: sanitizeText(data.short_description),
        header_image: typeof data.header_image === "string" ? data.header_image : "",
        developer: listOfStrings(data.developers),
        publisher: listOfStrings(data.publishers),
        release_date: sanitizeText(data.release_date?.date),
        coming_soon: !!data.release_date?.coming_soon,
        languages: parseSupportedLanguages(data.supported_languages),
        // Mirrors extractGenre in content/extract-metadata.js: first genre
        // that isn't the non-descriptive "Free to Play" chip.
        genre: genres.find((g) => g.toLowerCase() !== "free to play") || "",
        type_game: catsLower.some((c) => ONLINE_CATEGORY_SIGNALS.some((s) => c.includes(s)))
            ? "online" : "offline",
    };
}

/**
 * Fetch (or return cached) catalog info for an appid.
 *
 * @param {string} appid
 * @returns {Promise<object|null>} Mapped info, or null when unavailable.
 */
export async function fetchAppInfo(appid) {
    if (appInfoCache.has(appid)) return appInfoCache.get(appid);
    try {
        const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appid)}&filters=${APPDETAILS_FILTERS}&l=english`;
        const resp = await fetch(url);
        if (resp.ok) {
            const json = await resp.json();
            const entry = json && json[appid];
            if (entry && entry.success && entry.data) {
                const info = mapAppDetails(entry.data);
                appInfoCache.set(appid, info); // cache only confirmed results
                return info;
            }
            await logWarn("sw", `appdetails lookup for ${appid}: no data in response`);
        } else {
            await logWarn("sw", `appdetails lookup for ${appid}: HTTP ${resp.status}`);
        }
    } catch (err) {
        await logWarn("sw", `appdetails lookup failed for ${appid}: ${err.message || err}`);
    }
    // Fail open. Not cached, so a later hover or add retries.
    return null;
}

/** Drop all cached app info (extension reset). */
export function clearAppInfoCache() {
    appInfoCache.clear();
}
