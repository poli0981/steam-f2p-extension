// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * DOM helpers and cached selectors shared across extract-*.js modules.
 *
 * Cached selectors are queried lazily on first access and reused for the
 * lifetime of the content-script execution. Since the content script runs
 * once per page load (document_idle), cache invalidation is not needed.
 */

(function () {
    "use strict";
    const ns = globalThis.SF2P;

    // ── Primitive DOM helpers ──

    ns.textOf = function (sel) {
        const el = document.querySelector(sel);
        return el ? el.textContent.trim() : "";
    };

    ns.textsOf = function (sel) {
        return [...document.querySelectorAll(sel)].map((el) => el.textContent.trim().toLowerCase());
    };

    ns.hasCheck = function (cell) {
        return !!(cell && cell.querySelector("span"));
    };

    // ── Cached selector results ──
    // Many selectors are used by multiple modules; cache once per page load.
    const cache = {};

    /**
     * All .app_tag elements inside the popular-tags glance section.
     * Used by: extract-type, extract-platform, extract-lang-tags, extract-price fallback.
     */
    ns.getPopularTagEls = function () {
        if (!cache.popularTagEls) {
            cache.popularTagEls = [...document.querySelectorAll(".glance_tags.popular_tags a.app_tag")];
        }
        return cache.popularTagEls;
    };

    /**
     * Lowercased text of all popular tags. Cached on first call.
     */
    ns.getPopularTagTexts = function () {
        if (!cache.popularTagTexts) {
            cache.popularTagTexts = ns.getPopularTagEls().map((el) => el.textContent.trim().toLowerCase());
        }
        return cache.popularTagTexts;
    };

    /**
     * Breadcrumb link texts (lowercased). Used by isDLCPage, isDemo.
     */
    ns.getBreadcrumbTexts = function () {
        if (!cache.breadcrumbTexts) {
            cache.breadcrumbTexts = ns.textsOf(".blockbg a, .breadcrumbs a");
        }
        return cache.breadcrumbTexts;
    };

    /**
     * .dev_row collection. Used by extractPublisher, extractDeveloper fallback.
     */
    ns.getDevRows = function () {
        if (!cache.devRows) {
            cache.devRows = [...document.querySelectorAll(".dev_row")];
        }
        return cache.devRows;
    };

    /**
     * Reference to #appHeaderGridContainer (may be null). Used by grid-layout extractors.
     */
    ns.getGridContainer = function () {
        if (cache.gridContainer === undefined) {
            cache.gridContainer = document.querySelector("#appHeaderGridContainer");
        }
        return cache.gridContainer;
    };
})();
