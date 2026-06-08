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

    /**
     * Is this game delisted / no longer purchasable?
     * Steam renders a #purchase_note notice on removed titles, e.g.
     * "NAME is no longer available on the Steam store."
     */
    ns.isUnavailable = function () {
        const note = document.querySelector("#purchase_note");
        if (!note) return false;
        return note.textContent.toLowerCase().includes("no longer available");
    };

    /**
     * Is this a "Coming soon" / not-yet-released page?
     * Steam renders a .game_area_comingsoon bubble on unreleased titles
     * ("This game is not yet available on Steam"). Such a page can still
     * carry a "Free to Play" tag, so without this guard it would be
     * classified f2p and auto-queued before release.
     */
    ns.isComingSoon = function () {
        if (document.querySelector(".game_area_comingsoon")) return true;
        const notYet = document.querySelector(".not_yet");
        return !!notYet && notYet.textContent.toLowerCase().includes("not yet available");
    };

    /**
     * Is this a Community-Made Mod page (not a standalone game)?
     * Steam renders a .game_area_mod_bubble ("Community-Made Mod") on these,
     * yet still shows a "Free To Play" price and an "Install now" button — so
     * without this guard a mod would be misread as a free game and queued.
     */
    ns.isModPage = function () {
        if (document.querySelector(".game_area_mod_bubble")) return true;
        const purchase = document.querySelector("#game_area_purchase, .game_area_purchase");
        return !!purchase && purchase.textContent.toLowerCase().includes("community-made mod");
    };

    /**
     * Is this a Steam Video product (not a game)?
     * These render an <h2>Steam Video</h2> inside the description area and a
     * "only available in an online streaming format" notice. Anchor on the
     * heading text — .game_area_description exists on every app page, so the
     * container alone is not a reliable signal.
     */
    ns.isVideoPage = function () {
        const heads = document.querySelectorAll(
            ".game_area_description h2, #game_area_description h2"
        );
        for (const h of heads) {
            if (h.textContent.trim().toLowerCase() === "steam video") return true;
        }
        const desc = document.querySelector(".game_area_description, #game_area_description");
        return !!desc && desc.textContent.toLowerCase().includes("only available in an online streaming format");
    };
})();
