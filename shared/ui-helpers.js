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

// ── Toast stack (multiple toasts can be visible simultaneously) ──
//
// Toasts live inside a lazily-created container (`#sf2p-toast-container`)
// that is `position: fixed; bottom/right`. The container is aria-live so
// screen readers announce new messages without needing per-toast roles.
// Clicks fall through the container (`pointer-events: none`) but hit the
// toasts themselves (`pointer-events: auto`).

const TOAST_CONTAINER_ID = "sf2p-toast-container";
const MAX_TOASTS = 5;
const DEFAULT_TOAST_MS = 2500;

function getToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
        container = document.createElement("div");
        container.id = TOAST_CONTAINER_ID;
        container.className = "toast-container";
        container.setAttribute("role", "status");
        container.setAttribute("aria-live", "polite");
        container.setAttribute("aria-atomic", "false");
        document.body.appendChild(container);
    }
    return container;
}

function mountToast(toast) {
    const container = getToastContainer();
    // Cap the stack — evict the oldest so the newest always shows
    while (container.children.length >= MAX_TOASTS) {
        container.firstElementChild.remove();
    }
    container.appendChild(toast);
}

function dismissToast(toast) {
    if (toast.dataset.dismissing === "1") return;
    toast.dataset.dismissing = "1";
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 300);
}

/**
 * Show a transient toast notification. Toasts STACK — calling this while
 * others are visible adds a new one at the bottom of the stack (cap: 5).
 *
 * @param {string} text
 * @param {"info"|"success"|"warning"|"error"} [type="info"]
 * @param {{duration?: number}} [opts]
 */
export function showToast(text, type = "info", opts = {}) {
    const { duration = DEFAULT_TOAST_MS } = opts;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    mountToast(toast);
    setTimeout(() => dismissToast(toast), duration);
    return toast;
}

/**
 * Show a toast with an inline "Undo" button and a shrinking progress bar
 * that visualises the countdown. Stacks with other toasts.
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

    const toast = document.createElement("div");
    toast.className = `toast toast-${type} toast-undo`;
    toast.style.setProperty("--toast-duration", `${duration}ms`);

    const textSpan = document.createElement("span");
    textSpan.className   = "toast-text";
    textSpan.textContent = text;

    const undoBtn = document.createElement("button");
    undoBtn.type        = "button";
    undoBtn.className   = "toast-action";
    undoBtn.textContent = label;

    // Shrinking progress bar driven purely by CSS (animation-duration set
    // via the --toast-duration custom property). prefers-reduced-motion
    // hides the bar entirely (defined in theme.css).
    const progress = document.createElement("div");
    progress.className = "toast-progress";
    progress.setAttribute("aria-hidden", "true");

    toast.append(textSpan, undoBtn, progress);
    mountToast(toast);

    undoBtn.addEventListener("click", () => {
        dismissToast(toast);
        try { onUndo(); } catch (err) { console.error("[undo] callback failed:", err); }
    });

    setTimeout(() => dismissToast(toast), duration);
    return toast;
}
