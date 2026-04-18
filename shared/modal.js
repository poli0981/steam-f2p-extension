// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Themed confirmation dialog.
 *
 * Drop-in replacement for native `confirm()` that matches the extension's
 * design system (dark/light themes, backdrop-filter, animation). Returns a
 * Promise<boolean>.
 *
 *   import { confirmDialog } from "../shared/modal.js";
 *   const ok = await confirmDialog({
 *       title:   "Clear queue?",
 *       message: "Remove all 5 game(s)? You will have a few seconds to Undo.",
 *       confirmLabel: "Clear",
 *       cancelLabel:  "Cancel",
 *       danger:       true,
 *   });
 *   if (!ok) return;
 *
 * Interactions
 *   - Enter  → confirm
 *   - Esc    → cancel
 *   - Tab    → cycles focus between the two buttons (focus trap)
 *   - Click the backdrop → cancel
 *
 * The dialog restores focus to the element that was focused before opening
 * so keyboard users don't lose their place.
 */

/**
 * @typedef {Object} ConfirmOpts
 * @property {string} title
 * @property {string} message
 * @property {string} [confirmLabel="Confirm"]
 * @property {string} [cancelLabel="Cancel"]
 * @property {boolean} [danger=false]     - Styles the confirm button red
 * @property {"confirm"|"cancel"} [defaultAction="cancel"] - Initial focus
 */

let uidCounter = 0;

/**
 * Show a themed confirm dialog.
 * @param {ConfirmOpts} opts
 * @returns {Promise<boolean>} true = confirmed, false = cancelled / dismissed
 */
export function confirmDialog(opts) {
    const {
        title,
        message,
        confirmLabel = "Confirm",
        cancelLabel = "Cancel",
        danger = false,
        defaultAction = "cancel",
    } = opts || {};

    return new Promise((resolve) => {
        const previouslyFocused = document.activeElement;

        const backdrop = document.createElement("div");
        backdrop.className = "modal-backdrop";

        const titleId = `modal-title-${++uidCounter}`;
        const descId = `modal-desc-${uidCounter}`;

        const modal = document.createElement("div");
        modal.className = "modal";
        modal.setAttribute("role", "alertdialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", titleId);
        modal.setAttribute("aria-describedby", descId);

        const titleEl = document.createElement("h2");
        titleEl.className = "modal-title";
        titleEl.id = titleId;
        titleEl.textContent = title || "";

        const messageEl = document.createElement("p");
        messageEl.className = "modal-message";
        messageEl.id = descId;
        messageEl.textContent = message || "";

        const actions = document.createElement("div");
        actions.className = "modal-actions";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn btn-ghost";
        cancelBtn.textContent = cancelLabel;

        const confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;
        confirmBtn.textContent = confirmLabel;

        actions.append(cancelBtn, confirmBtn);
        modal.append(titleEl, messageEl, actions);
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        // Initial focus on next frame so the entry animation doesn't steal it.
        requestAnimationFrame(() => {
            (defaultAction === "confirm" ? confirmBtn : cancelBtn).focus();
        });

        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            document.removeEventListener("keydown", onKey);
            backdrop.classList.add("modal-out");
            // Match keyframe duration in theme.css (.modal-backdrop.modal-out)
            setTimeout(() => {
                backdrop.remove();
                // Return focus for keyboard users
                if (previouslyFocused && typeof previouslyFocused.focus === "function") {
                    try { previouslyFocused.focus(); } catch { /* detached */ }
                }
                resolve(result);
            }, 200);
        };

        const onKey = (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                finish(false);
            } else if (e.key === "Enter") {
                // Fire whichever button is focused; fall back to confirm.
                e.preventDefault();
                if (document.activeElement === cancelBtn) finish(false);
                else finish(true);
            } else if (e.key === "Tab") {
                // Two-button focus trap — just flip
                e.preventDefault();
                const target = document.activeElement === cancelBtn ? confirmBtn : cancelBtn;
                target.focus();
            }
        };

        document.addEventListener("keydown", onKey);

        cancelBtn.addEventListener("click", () => finish(false));
        confirmBtn.addEventListener("click", () => finish(true));

        // Click on the backdrop (not inside the modal) cancels
        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) finish(false);
        });
    });
}
