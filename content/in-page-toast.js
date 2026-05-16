// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * In-page toast (v1.16.0).
 *
 * Renders auto-collect notifications in the bottom-right corner of the
 * browser viewport on store.steampowered.com pages. Steam ships heavy
 * global CSS, so the toast lives inside a Shadow DOM attached to
 * document.documentElement (NOT document.body — Steam frequently
 * mutates body subtrees). Styles are inlined into the shadow root so
 * Steam selectors can't reach them.
 *
 * Attached as SF2P.showInPageToast(text, type, opts?).
 *
 *   text   — string
 *   type   — "success" | "error" | "warning" | "info"  (default "info")
 *   opts.duration — auto-dismiss ms (default 3500)
 *   opts.link     — { label: string, action: "open_queue" }
 *
 * The only link `action` understood today is "open_queue", which sends
 * MSG.OPEN_EXTENSION_PAGE so the service worker's singleton-tab
 * registry handles focusing / creating the Queue tab.
 */

(function () {
    "use strict";

    const SF2P = globalThis.SF2P;
    if (!SF2P) {
        console.error("[SF2P] in-page-toast: namespace missing — manifest content-script order is wrong");
        return;
    }

    const TOAST_CSS = `
:host {
    all: initial;
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 2147483647;
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
    max-width: 360px;
}

.toast {
    pointer-events: auto;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.4;
    font-weight: 500;
    color: #0F1724;
    background: #66C0F4;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.20);
    border: 1px solid rgba(255, 255, 255, 0.18);
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 0.2s ease, transform 0.2s ease;
    word-wrap: break-word;
    overflow-wrap: anywhere;
}

.toast.show {
    opacity: 1;
    transform: translateY(0);
}

.toast.fade {
    opacity: 0;
    transform: translateY(8px);
}

.toast.success { background: #34D399; color: #0F1724; }
.toast.error   { background: #F87171; color: #1F0A0A; }
.toast.warning { background: #FBBF24; color: #1F1609; }
.toast.info    { background: #66C0F4; color: #0F1724; }

.toast a {
    color: inherit;
    text-decoration: underline;
    margin-left: 8px;
    cursor: pointer;
    font-weight: 600;
}

.toast a:hover { opacity: 0.85; }
`;

    let shadowRoot = null;
    let stackEl = null;

    function ensureShadow() {
        if (shadowRoot) return shadowRoot;

        const host = document.createElement("div");
        host.id = "sf2p-toast-host";
        // documentElement, not body — Steam re-renders large portions of
        // body during in-page navigation and could nuke the host.
        document.documentElement.appendChild(host);

        shadowRoot = host.attachShadow({ mode: "open" });

        const styleEl = document.createElement("style");
        styleEl.textContent = TOAST_CSS;
        shadowRoot.appendChild(styleEl);

        stackEl = document.createElement("div");
        stackEl.className = "stack";
        shadowRoot.appendChild(stackEl);

        return shadowRoot;
    }

    function dismiss(el) {
        if (!el || !el.isConnected) return;
        el.classList.remove("show");
        el.classList.add("fade");
        setTimeout(() => { el.remove(); }, 250);
    }

    SF2P.showInPageToast = function (text, type, opts) {
        if (!text) return;
        ensureShadow();

        const safeType = ["success", "error", "warning", "info"].includes(type) ? type : "info";
        const duration = (opts && Number.isFinite(opts.duration)) ? opts.duration : 3500;

        const el = document.createElement("div");
        el.className = `toast ${safeType}`;
        el.textContent = text;

        if (opts && opts.link && opts.link.label) {
            const a = document.createElement("a");
            a.textContent = opts.link.label;
            a.href = "#";
            a.addEventListener("click", (e) => {
                e.preventDefault();
                if (opts.link.action === "open_queue") {
                    // Hard-coded message type matches MSG.OPEN_EXTENSION_PAGE in
                    // shared/constants.js. Content scripts load as IIFEs so we
                    // can't import the constant; the string contract is stable.
                    chrome.runtime.sendMessage({
                        type: "OPEN_EXTENSION_PAGE",
                        data: { path: "queue/queue.html" },
                    }, () => { if (chrome.runtime.lastError) return; });
                }
                dismiss(el);
            });
            el.appendChild(a);
        }

        stackEl.appendChild(el);
        // Force reflow before adding .show so the transition runs.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => { el.classList.add("show"); });
        });

        setTimeout(() => dismiss(el), duration);
    };
})();
