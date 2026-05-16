// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Localized notification text catalog for the auto-collect feature (v1.16.0).
 *
 * The service worker imports this module to compose the toast messages
 * surfaced by the in-page content-script toast. Two locales are
 * supplied: English (`en`) and Vietnamese (`vi`). `auto` resolves to
 * `vi` if the worker's `navigator.language` starts with `vi`, otherwise
 * `en`.
 */

const TEXT = {
    en: {
        added:     (name, id) => `Game ${name || "(unnamed)"} with id ${id} added`,
        notFree:   (name, id) => `Game ${name || "(unnamed)"} with id ${id} is not free`,
        dlc:       (_n, _id) => `This page is DLC`,
        demo:      (_n, _id) => `This page is a demo`,
        playtest:  (_n, _id) => `This page is a playtest`,
        duplicate: (name, _id) => `${name || "Game"} is already in the queue`,
        queueFull: ()           => `Queue is full (150/150)`,
        openQueue: "Open queue",
    },
    vi: {
        added:     (name, id) => `Đã thêm game ${name || "(không tên)"} (id ${id})`,
        notFree:   (name, id) => `Game ${name || "(không tên)"} (id ${id}) không miễn phí`,
        dlc:       (_n, _id) => `Trang này là DLC`,
        demo:      (_n, _id) => `Trang này là demo`,
        playtest:  (_n, _id) => `Trang này là playtest`,
        duplicate: (name, _id) => `${name || "Game"} đã có trong hàng đợi`,
        queueFull: ()           => `Hàng đợi đã đầy (150/150)`,
        openQueue: "Mở hàng đợi",
    },
};

/**
 * Resolve `notify_lang` setting to a concrete locale key.
 * @param {string} setting - "auto" | "en" | "vi"
 * @returns {"en"|"vi"}
 */
export function resolveNotifyLang (setting) {
    if (setting === "en" || setting === "vi") return setting;
    // auto: prefer VI if the worker's language hints Vietnamese.
    const nav = typeof navigator !== "undefined" ? navigator.language || "" : "";
    return nav.toLowerCase ().startsWith ("vi") ? "vi" : "en";
}

/**
 * Get the notification text bundle for a locale.
 * @param {"en"|"vi"} lang
 * @returns {object}
 */
export function getNotifyText (lang) {
    return TEXT[lang] || TEXT.en;
}
