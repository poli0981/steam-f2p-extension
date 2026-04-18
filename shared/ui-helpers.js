// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Shared UI helpers used by popup, queue and settings pages.
 *
 *   - $(selector)             → shorthand for document.querySelector
 *   - sendMessage(type, data) → chrome.runtime.sendMessage with {type, data}
 *   - showToast(text, type)   → transient toast notification (info|success|warning|error)
 */

/**
 * Document querySelector shorthand.
 * @param {string} selector
 * @returns {Element|null}
 */
export const $ = (selector) => document.querySelector(selector);

/**
 * Dispatch a message to the service worker and return its response.
 * @param {string} type
 * @param {*} [data]
 * @returns {Promise<any>}
 */
export function sendMessage(type, data = null) {
    return chrome.runtime.sendMessage({ type, data });
}

/**
 * Show a transient toast notification.
 * Removes any existing toast first, auto-dismisses after 2.5s.
 *
 * @param {string} text
 * @param {"info"|"success"|"warning"|"error"} [type="info"]
 */
export function showToast(text, type = "info") {
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}
