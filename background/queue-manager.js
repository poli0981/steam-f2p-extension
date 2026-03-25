// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Queue manager – CRUD operations for the pending game queue.
 * Enforces cap at QUEUE_MAX (150), validates entries, prevents local duplicates.
 */

import {QUEUE_MAX} from "../shared/constants.js";
import {loadQueue, saveQueue} from "../shared/storage.js";
import {extractAppId, makeQueueEntry} from "../shared/utils.js";
import {logInfo, logWarn} from "../shared/logger.js";

/**
 * Add a game to the queue.
 * @param {object} gameData - Detected game data from content script
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function addToQueue(gameData) {
    if (!gameData || !gameData.link) {
        return {ok: false, error: "No game data or link provided"};
    }

    const queue = await loadQueue();

    // Cap check
    if (queue.length >= QUEUE_MAX) {
        await logWarn("queue", `Queue full (${QUEUE_MAX}/${QUEUE_MAX}). Push or remove entries.`);
        return {ok: false, error: `Queue is full (${QUEUE_MAX}/${QUEUE_MAX}). Push or remove entries first.`};
    }

    const entry = makeQueueEntry(gameData);
    if (!entry.link) {
        return {ok: false, error: "Invalid link format"};
    }

    const appid = extractAppId(entry.link);
    if (!appid) {
        return {ok: false, error: "Could not extract appid from link"};
    }

    // Local duplicate check
    const exists = queue.some((g) => extractAppId(g.link) === appid);
    if (exists) {
        return {ok: false, error: "Game already in queue"};
    }

    // Preserve any extra fields from gameData (name, genre, etc.)
    if (gameData.name) entry.name = gameData.name;
    if (gameData.genre) entry.genre = gameData.genre;
    if (gameData.developer) entry.developer = gameData.developer;
    if (gameData.header_image) entry.header_image = gameData.header_image;
    if (gameData.release_date) entry.release_date = gameData.release_date;

    // Auto-detect online/offline from content script
    if (gameData.type_game && (gameData.type_game === "online" || gameData.type_game === "offline")) {
        entry.type_game = gameData.type_game;
    }

    // Auto-detect anti-cheat (only meaningful for online games)
    if (gameData.anti_cheat && gameData.anti_cheat !== "-") {
        entry.anti_cheat = gameData.anti_cheat;
    }

    // Auto-notes from detector (DLC trả phí, anti-cheat info, etc.)
    if (gameData.auto_notes && gameData.auto_notes.length > 0) {
        const existing = entry.notes || "";
        const newNotes = gameData.auto_notes
            .filter((n) => !existing.includes(n)) // avoid duplicates
            .join("; ");
        if (newNotes) {
            entry.notes = existing ? `${existing}; ${newNotes}` : newNotes;
        }
    } else if (gameData.has_paid_dlc) {
        // Fallback: manual DLC note if auto_notes not provided
        const dlcNote = "Paid DLC";
        if (!entry.notes || !entry.notes.includes(dlcNote)) {
            entry.notes = entry.notes ? `${entry.notes}; ${dlcNote}` : dlcNote;
        }
    }

    queue.push(entry);
    await saveQueue(queue);

    await logInfo("queue", `Added to queue: ${entry.name || appid}`, {appid, link: entry.link});

    return {ok: true, data: {entry, queueSize: queue.length}};
}

/**
 * Remove a game from the queue by appid.
 * @param {string} appid
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function removeFromQueue(appid) {
    if (!appid) {
        return {ok: false, error: "No appid provided"};
    }

    const queue = await loadQueue();
    const before = queue.length;
    const filtered = queue.filter((g) => extractAppId(g.link) !== appid);

    if (filtered.length === before) {
        return {ok: false, error: "Game not found in queue"};
    }

    await saveQueue(filtered);
    await logInfo("queue", `Removed from queue: appid ${appid}`, {appid});

    return {ok: true, data: {queueSize: filtered.length}};
}

/**
 * Update optional fields on a queued game entry.
 * @param {string} appid
 * @param {object} fields - Fields to update (type_game, anti_cheat, notes, safe, genre)
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function updateEntry(appid, fields) {
    if (!appid || !fields) {
        return {ok: false, error: "Missing appid or fields"};
    }

    const queue = await loadQueue();
    const index = queue.findIndex((g) => extractAppId(g.link) === appid);

    if (index === -1) {
        return {ok: false, error: "Game not found in queue"};
    }

    // Only allow updating known optional fields
    const allowedFields = new Set(["type_game", "anti_cheat", "notes", "safe", "genre"]);
    const applied = {};

    for (const [key, value] of Object.entries(fields)) {
        if (allowedFields.has(key)) {
            queue[index][key] = String(value).trim();
            applied[key] = queue[index][key];
        }
    }

    if (Object.keys(applied).length === 0) {
        return {ok: false, error: "No valid fields to update"};
    }

    await saveQueue(queue);
    await logInfo("queue", `Updated entry: appid ${appid}`, {appid, fields: applied});

    return {ok: true, data: {entry: queue[index]}};
}

/**
 * Get current queue size.
 * @returns {Promise<number>}
 */
export async function getQueueSize() {
    const queue = await loadQueue();
    return queue.length;
}

/**
 * Clear the entire queue.
 * @returns {Promise<void>}
 */
export async function clearQueue() {
    await saveQueue([]);
    await logInfo("queue", "Queue cleared");
}
