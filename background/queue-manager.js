// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Queue manager – CRUD operations for the pending game queue.
 * Enforces cap at QUEUE_MAX (150), validates entries, prevents local duplicates.
 *
 * Field classification:
 *   - AUTO fields (read-only): populated by detector, cannot be edited by user
 *     → description, release_date, developer, publisher, platforms,
 *       languages, language_details, tags, header_image, name
 *   - EDITABLE fields: user can modify in queue UI
 *     → type_game, anti_cheat, genre, notes, safe
 */

import {QUEUE_MAX} from "../shared/constants.js";
import {loadQueue, saveQueue} from "../shared/storage.js";
import {extractAppId, makeQueueEntry} from "../shared/utils.js";
import {logInfo, logWarn} from "../shared/logger.js";

// ── Fields that the user is NOT allowed to edit via UPDATE_ENTRY ──
const AUTO_LOCKED_FIELDS = new Set ([
                                        "link", "name", "header_image", "added_at",
                                        "description", "release_date", "developer", "publisher",
                                        "platforms", "languages", "language_details", "tags",
                                    ]);

// ── Fields the user CAN edit ──
const EDITABLE_FIELD_KEYS = new Set ([
                                         "type_game", "anti_cheat", "genre", "notes", "safe",
                                     ]);

/**
 * Add a game to the queue.
 *
 * Merges detector data into a queue entry via makeQueueEntry(),
 * then overlays auto-detected enrichments (type_game, anti_cheat, auto_notes).
 *
 * @param {object} gameData - Detected game data from content script
 * @returns {Promise<{ok: boolean, error?: string, data?: object}>}
 */
export async function addToQueue (gameData) {
    if (!gameData || !gameData.link) {
        return {ok: false, error: "No game data or link provided"};
    }

    const queue = await loadQueue ();

    // Cap check
    if (queue.length >= QUEUE_MAX) {
        await logWarn ("queue", `Queue full (${QUEUE_MAX}/${QUEUE_MAX}). Push or remove entries.`);
        return {
            ok: false,
            error: `Queue is full (${QUEUE_MAX}/${QUEUE_MAX}). Push or remove entries first.`,
        };
    }

    // Build base entry from detected data (includes all auto + editable fields)
    const entry = makeQueueEntry (gameData);
    if (!entry.link) {
        return {ok: false, error: "Invalid link format"};
    }

    const appid = extractAppId (entry.link);
    if (!appid) {
        return {ok: false, error: "Could not extract appid from link"};
    }

    // Local duplicate check
    const exists = queue.some ((g) => extractAppId (g.link) === appid);
    if (exists) {
        return {ok: false, error: "Game already in queue"};
    }

    // ── Auto-detect enrichments from gameData ──

    // type_game: prefer detector's classification if meaningful
    if (gameData.type_game && (
        gameData.type_game === "online" || gameData.type_game === "offline"
    )) {
        entry.type_game = gameData.type_game;
    }

    // anti_cheat: only override default if detector found something
    if (gameData.anti_cheat && gameData.anti_cheat !== "-") {
        entry.anti_cheat = gameData.anti_cheat;
    }

    // auto_notes: merge detector's auto-notes (DLC trả phí, anti-cheat info, etc.)
    if (gameData.auto_notes && gameData.auto_notes.length > 0) {
        const existing = entry.notes || "";
        const newNotes = gameData.auto_notes
                                 .filter ((n) => !existing.includes (n)) // avoid duplicates
                                 .join ("; ");
        if (newNotes) {
            entry.notes = existing ? `${existing}; ${newNotes}` : newNotes;
        }
    }
    else if (gameData.has_paid_dlc) {
        // Fallback: manual DLC note if auto_notes not provided
        const dlcNote = "Có DLC trả phí";
        if (!entry.notes || !entry.notes.includes (dlcNote)) {
            entry.notes = entry.notes ? `${entry.notes}; ${dlcNote}` : dlcNote;
        }
    }

    // anti_cheat_note: store full note for reference (not shown in queue but used in push)
    if (gameData.anti_cheat_note) {
        entry.anti_cheat_note = gameData.anti_cheat_note;
    }

    // is_kernel_ac: store kernel classification
    if (gameData.is_kernel_ac !== undefined) {
        entry.is_kernel_ac = gameData.is_kernel_ac;
    }

    queue.push (entry);
    await saveQueue (queue);

    await logInfo ("queue", `Added to queue: ${entry.name || appid}`, {
        appid,
        link: entry.link,
        genre: entry.genre,
        type_game: entry.type_game,
        anti_cheat: entry.anti_cheat,
        platforms: entry.platforms,
        languages_count: (
            entry.languages || []
        ).length,
        tags_count: (
            entry.tags || []
        ).length,
    });

    return {ok: true, data: {entry, queueSize: queue.length}};
}

/**
 * Remove a game from the queue by appid.
 * @param {string} appid
 * @returns {Promise<{ok: boolean, error?: string, data?: object}>}
 */
export async function removeFromQueue (appid) {
    if (!appid) {
        return {ok: false, error: "No appid provided"};
    }

    const queue = await loadQueue ();
    const before = queue.length;
    const filtered = queue.filter ((g) => extractAppId (g.link) !== appid);

    if (filtered.length === before) {
        return {ok: false, error: "Game not found in queue"};
    }

    await saveQueue (filtered);
    await logInfo ("queue", `Removed from queue: appid ${appid}`, {appid});

    return {ok: true, data: {queueSize: filtered.length}};
}

/**
 * Update editable fields on a queued game entry.
 *
 * Only EDITABLE_FIELD_KEYS are accepted. Auto-detected fields
 * (description, release_date, developer, publisher, platforms,
 * languages, tags, etc.) are protected and cannot be overwritten.
 *
 * @param {string} appid
 * @param {object} fields - Fields to update
 * @returns {Promise<{ok: boolean, error?: string, data?: object}>}
 */
export async function updateEntry (appid, fields) {
    if (!appid || !fields) {
        return {ok: false, error: "Missing appid or fields"};
    }

    const queue = await loadQueue ();
    const index = queue.findIndex ((g) => extractAppId (g.link) === appid);

    if (index === -1) {
        return {ok: false, error: "Game not found in queue"};
    }

    const applied = {};
    const rejected = [];

    for (const [key, value] of Object.entries (fields)) {
        if (AUTO_LOCKED_FIELDS.has (key)) {
            rejected.push (key);
            continue;
        }
        if (EDITABLE_FIELD_KEYS.has (key)) {
            queue[index][key] = typeof value === "string" ? value.trim () : value;
            applied[key] = queue[index][key];
        }
        else {
            rejected.push (key);
        }
    }

    if (Object.keys (applied).length === 0) {
        const reason = rejected.length > 0
                       ? `Fields not editable: ${rejected.join (", ")}`
                       : "No valid fields to update";
        return {ok: false, error: reason};
    }

    await saveQueue (queue);

    if (rejected.length > 0) {
        await logWarn ("queue", `Update entry ${appid}: applied ${Object.keys (applied)
                                                                        .join (", ")}, rejected ${rejected.join (", ")}`, {
                           appid, applied, rejected,
                       });
    }
    else {
        await logInfo ("queue", `Updated entry: appid ${appid}`, {appid, fields: applied});
    }

    return {ok: true, data: {entry: queue[index], applied, rejected}};
}

/**
 * Get current queue size.
 * @returns {Promise<number>}
 */
export async function getQueueSize () {
    const queue = await loadQueue ();
    return queue.length;
}

/**
 * Clear the entire queue.
 * @returns {Promise<{ok: boolean}>}
 */
export async function clearQueue () {
    await saveQueue ([]);
    await logInfo ("queue", "Queue cleared");
    return {ok: true};
}

/**
 * Get a single entry by appid (for inspection/debug).
 * @param {string} appid
 * @returns {Promise<object|null>}
 */
export async function getEntry (appid) {
    if (!appid) return null;
    const queue = await loadQueue ();
    return queue.find ((g) => extractAppId (g.link) === appid) || null;
}