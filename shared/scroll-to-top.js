// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Floating "scroll to top" button for the long Settings / Queue pages.
 *
 * initScrollToTop() injects a fixed bottom-right button into <body>.
 * It fades in once the user scrolls past THRESHOLD px and returns the
 * page to the top on click — smoothly, or instantly when the OS
 * "reduce motion" preference is set. Styling lives in shared/theme.css
 * (the .scroll-top-btn rule).
 */

const THRESHOLD = 320;

export function initScrollToTop() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "scroll-top-btn";
    btn.setAttribute("aria-label", "Scroll to top");
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;

    btn.addEventListener("click", () => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    });

    document.body.appendChild(btn);

    // Toggle visibility on scroll, throttled to one update per frame.
    let ticking = false;
    const sync = () => {
        btn.classList.toggle("visible", window.scrollY > THRESHOLD);
        ticking = false;
    };
    window.addEventListener("scroll", () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(sync);
    }, { passive: true });
    sync();
}
