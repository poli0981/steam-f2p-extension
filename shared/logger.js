// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Structured logger with chrome.storage persistence.
 * Supports levels, categories, auto-pruning, and JSON export.
 */

import {LOG_LEVELS, LOG_MAX_DEFAULT, STORAGE_KEYS} from "./constants.js";
import {loadSettings, storageGet, storageSet} from "./storage.js";

/**
 * Determine if a log level should be recorded given the configured minimum.
 * @param {string} level - The level to check
 * @param {string} minLevel - The minimum level from settings
 * @returns {boolean}
 */
function shouldLog(level, minLevel) {
    return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(minLevel);
}

/**
 * Append a log entry to storage.
 * Auto-prunes oldest entries when max is exceeded.
 *
 * @param {string} level - debug | info | warn | error
 * @param {string} category - push | queue | dedup | gpg | settings | GitHub | detector
 * @param {string} message - Human-readable message
 * @param {object} [data] - Optional structured data
 */
export async function log(level, category, message, data = undefined) {
    try {
        const settings = await loadSettings();
        const minLevel = settings.log_level || "info";
        const maxEntries = settings.log_max_entries || LOG_MAX_DEFAULT;

        if (!shouldLog(level, minLevel)) return;

        const entry = {
            timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
            level,
            category,
            message,
        };
        if (data !== undefined) {
            entry.data = data;
        }

        const logs = await storageGet(STORAGE_KEYS.LOGS, []);
        logs.push(entry);

        // Prune from front (oldest) if over cap
        while (logs.length > maxEntries) {
            logs.shift();
        }

        await storageSet(STORAGE_KEYS.LOGS, logs);
    } catch (err) {
        // Fallback to console if storage fails
        console.error("[logger] Failed to persist log:", err);
        console.log(`[${level}][${category}] ${message}`, data);
    }
}

// ── Convenience methods ──

export const logDebug = (cat, msg, data) => log("debug", cat, msg, data);
export const logInfo = (cat, msg, data) => log("info", cat, msg, data);
export const logWarn = (cat, msg, data) => log("warn", cat, msg, data);
export const logError = (cat, msg, data) => log("error", cat, msg, data);

// ── Log retrieval & management ──

/**
 * Get all stored log entries.
 * @param {object} [filter] - Optional filter { level, category }
 * @returns {Promise<Array>}
 */
export async function getLogs(filter = {}) {
    const logs = await storageGet(STORAGE_KEYS.LOGS, []);

    if (!filter.level && !filter.category) return logs;

    return logs.filter((entry) => {
        if (filter.level && !shouldLog(entry.level, filter.level)) return false;
        if (filter.category && entry.category !== filter.category) return false;
        return true;
    });
}

/**
 * Clear all stored logs.
 * @returns {Promise<void>}
 */
export async function clearLogs() {
    await storageSet(STORAGE_KEYS.LOGS, []);
}

/**
 * Export logs as a JSON string (for download).
 * @returns {Promise<string>}
 */
export async function exportLogsJSON() {
    const logs = await storageGet(STORAGE_KEYS.LOGS, []);
    return JSON.stringify(logs, null, 2);
}
