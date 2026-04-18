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

/**
 * Show a toast with an inline "Undo" button.
 *
 * Clicking Undo invokes the callback and dismisses the toast immediately.
 * If the duration elapses without a click, the toast fades and the action
 * is considered confirmed.
 *
 * @param {string} text
 * @param {() => (void|Promise<void>)} onUndo
 * @param {{duration?: number, type?: string, label?: string}} [opts]
 */
export function showUndoToast(text, onUndo, opts = {}) {
    const { duration = 6000, type = "info", label = "Undo" } = opts;

    // Replace any currently-visible toast (same pattern as showToast)
    document.querySelectorAll(".toast").forEach((t) => t.remove());

    const toast = document.createElement("div");
    toast.className = `toast toast-${type} toast-undo`;

    const textSpan = document.createElement("span");
    textSpan.className = "toast-text";
    textSpan.textContent = text;

    const undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.className = "toast-action";
    undoBtn.textContent = label;

    toast.appendChild(textSpan);
    toast.appendChild(undoBtn);
    document.body.appendChild(toast);

    let dismissed = false;
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 300);
    };

    undoBtn.addEventListener("click", () => {
        dismiss();
        try { onUndo(); } catch (err) { console.error("[undo] callback failed:", err); }
    });

    setTimeout(dismiss, duration);
}
