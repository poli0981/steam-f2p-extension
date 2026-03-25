// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Shared constants & configuration.
 * Single source of truth for URLs, limits, defaults, and field definitions.
 */

// ── GitHub API ──
export const GITHUB_API_BASE = "https://api.github.com";
// ── Repository paths ──
export const REPO_DATA_PATH = "scripts/data.jsonl";
export const REPO_TEMP_PATH = "scripts/temp_info.jsonl";

// ── Steam ──
export const STEAM_STORE_URL = "https://store.steampowered.com/app/";
export const APPID_RE = /store\.steampowered\.com\/app\/(\d+)/;

// ── Queue limits ──
export const QUEUE_MAX = 150;

// ── Logging ──
export const LOG_LEVELS = ["debug", "info", "warn", "error"];
export const LOG_MAX_DEFAULT = 500;

// ── Optional game fields (user-editable per entry) ──
export const OPTIONAL_FIELDS = {
    type_game: {label: "Type", type: "select", options: ["online", "offline"], default: "offline"},
    anti_cheat: {label: "Anti-Cheat", type: "text", placeholder: "VAC, EAC, none...", default: "-"},
    notes: {label: "Notes", type: "text", placeholder: "Any notes...", default: ""},
    safe: {label: "Safe", type: "select", options: ["?", "yes", "no"], default: "?"},
    genre: {label: "Genre Override", type: "text", placeholder: "Override detected genre...", default: ""},
};

// ── Storage keys ──
export const STORAGE_KEYS = {
    SETTINGS: "settings",
    QUEUE: "queue",
    LOGS: "logs",
    CACHE_APPIDS: "cache:appids",
    CACHE_DATA_SHA: "cache:data_sha",
    CACHE_TEMP_SHA: "cache:temp_sha",
    GPG_KEY_ENC: "gpg:key_encrypted",
    GPG_KEY_META: "gpg:key_meta",
};

// ── Default settings (used on fresh install & after reset) ──
export const DEFAULT_SETTINGS = {
    // GitHub connection
    github_owner: "",
    github_repo: "",
    github_branch: "main",
    github_token: "",

    // Committer identity
    committer_name: "",
    committer_email: "",

    // GPG
    gpg_enabled: false,

    // Push
    auto_push_threshold: 0,    // 0 = disabled
    commit_prefix: "ext:",

    // Cache
    cache_ttl_minutes: 5,

    // Logging
    log_level: "info",
    log_max_entries: 500,
};

// ── Message types (content script ↔ service worker) ──
export const MSG = {
    GAME_DETECTED: "GAME_DETECTED",
    GET_QUEUE: "GET_QUEUE",
    ADD_TO_QUEUE: "ADD_TO_QUEUE",
    REMOVE_FROM_QUEUE: "REMOVE_FROM_QUEUE",
    UPDATE_ENTRY: "UPDATE_ENTRY",
    PUSH_QUEUE: "PUSH_QUEUE",
    GET_SETTINGS: "GET_SETTINGS",
    SAVE_SETTINGS: "SAVE_SETTINGS",
    CHECK_DUPLICATE: "CHECK_DUPLICATE",
    GET_QUEUE_SIZE: "GET_QUEUE_SIZE",
    GET_LOGS: "GET_LOGS",
    EXPORT_LOGS: "EXPORT_LOGS",
    CLEAR_LOGS: "CLEAR_LOGS",
    RESET_EXTENSION: "RESET_EXTENSION",
    REFRESH_CACHE: "REFRESH_CACHE",
    GPG_IMPORT_KEY: "GPG_IMPORT_KEY",
    GPG_VALIDATE_KEY: "GPG_VALIDATE_KEY",
    GPG_GET_KEY_META: "GPG_GET_KEY_META",
    GPG_REMOVE_KEY: "GPG_REMOVE_KEY",
    PUSH_QUEUE_UNSIGNED: "PUSH_QUEUE_UNSIGNED",
};
