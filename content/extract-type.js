// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Page-type classifiers: DLC, Demo, Playtest, plus free-type (f2p / free_game / paid).
 */

(function () {
    "use strict";
    const ns = globalThis.SF2P;

    /**
     * Classify the free-type when a game is known to be free.
     *
     * @param {boolean} isFree - Is the base game free?
     * @param {boolean} hasPaidDLC - Does the game have paid DLC?
     * @param {string} freeHint - Hint from DOM price parsing ("f2p" | "free_game" | "demo" | "")
     * @returns {"f2p"|"free_game"|"paid"|"demo"}
     */
    ns.classifyFreeType = function (isFree, hasPaidDLC, freeHint) {
        if (!isFree) return "paid";
        if (freeHint === "demo") return "demo";
        if (freeHint === "f2p") return "f2p";

        const allLabels = [
            ...ns.getPopularTagTexts(),
            ...ns.textsOf("#genresAndManufacturer a"),
        ];

        const hasF2PTag = allLabels.includes("free to play");
        const hasInApp = allLabels.some((t) =>
            t.includes("in-app") || t.includes("microtransaction") || t.includes("in app")
        );

        if (hasF2PTag || hasInApp || hasPaidDLC) return "f2p";
        return "free_game";
    };

    /**
     * Is this the Steam store page for a DLC (not a base game)?
     */
    ns.isDLCPage = function () {
        if (document.querySelector(".game_area_dlc_bubble")) return true;

        const crumbs = ns.getBreadcrumbTexts();
        if (crumbs.some((t) => t.includes("downloadable content"))) return true;

        const genreArea = document.querySelector("#genresAndManufacturer");
        if (genreArea && genreArea.textContent.toLowerCase().includes("downloadable content")) return true;

        return false;
    };

    /**
     * Is this a demo page?
     */
    ns.isDemo = function () {
        const crumbs = ns.getBreadcrumbTexts();
        if (crumbs.some((t) => t === "demo" || t === "demos")) return true;

        const purchaseText = ns.textOf(".game_area_purchase_game_wrapper").toLowerCase();
        if (purchaseText.includes("download demo") && !purchaseText.includes("play game")) return true;

        const name = ns.textOf(".apphub_AppName").toLowerCase();
        if (name.endsWith(" demo") || name.includes(" demo ") || name.startsWith("demo ")) return true;

        return false;
    };

    /**
     * Is this a playtest page?
     */
    ns.isPlaytest = function () {
        const purchaseText = ns.textOf(".game_area_purchase_game_wrapper").toLowerCase();
        if (purchaseText.includes("join playtest") || purchaseText.includes("request access")) return true;

        const name = ns.textOf(".apphub_AppName").toLowerCase();
        if (name.includes("playtest")) return true;

        if (document.querySelector("[data-featuretarget='playtest-section']")) return true;

        return false;
    };
})();
