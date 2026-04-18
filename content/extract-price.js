// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Price detection.
 *
 * Strategy:
 *   1. schema.org meta[itemprop="price"] — most reliable, structured data
 *   2. DOM parsing of .game_area_purchase_game — fallback for unusual layouts
 *   3. detectPaidDLC() — scans #gameAreaDLCSection for paid DLC rows
 */

(function () {
    "use strict";
    const ns = globalThis.SF2P;

    /**
     * Try schema.org structured data first — most reliable.
     *
     * Steam embeds:
     *   <meta itemprop="price" content="0">         → free
     *   <meta itemprop="price" content="82.500">    → paid (82500 VND)
     *   <meta itemprop="priceCurrency" content="VND">
     *
     * There may be multiple Offer blocks (base game + DLC).
     * The first one outside #gameAreaDLCSection is the base game.
     */
    ns.getBasePriceFromSchema = function () {
        const offers = document.querySelectorAll('[itemtype="http://schema.org/Offer"]');

        for (const offer of offers) {
            if (offer.closest("#gameAreaDLCSection, .game_area_dlc_section, .game_area_dlc_list")) {
                continue;
            }

            const priceMeta = offer.querySelector('meta[itemprop="price"]');
            const currencyMeta = offer.querySelector('meta[itemprop="priceCurrency"]');

            if (priceMeta) {
                const rawPrice = (priceMeta.getAttribute("content") || "").trim();
                const currency = (currencyMeta?.getAttribute("content") || "").trim();

                const numericStr = rawPrice.replace(/\./g, "").replace(",", ".");
                const value = parseFloat(numericStr);

                if (!isNaN(value) && value === 0) {
                    return { isFree: true, price: "", currency };
                }
                if (!isNaN(value) && value > 0) {
                    return { isFree: false, price: rawPrice + (currency ? ` ${currency}` : ""), currency };
                }
            }
        }

        return null;
    };

    /**
     * Fallback: parse purchase blocks in the DOM.
     */
    ns.getBasePriceFromDOM = function () {
        const blocks = document.querySelectorAll(".game_area_purchase_game");

        for (const block of blocks) {
            if (block.closest("#gameAreaDLCSection, .game_area_dlc_section")) continue;

            const text = block.textContent.toLowerCase();
            const heading = block.querySelector("h1, h2");
            const hText = heading ? heading.textContent.toLowerCase() : "";

            // Skip bundles
            if (hText.includes("bundle") || hText.includes("package") ||
                text.includes("items included in this bundle") ||
                text.includes("items included in this package")) {
                continue;
            }

            // Skip DLC purchase blocks
            if (hText.includes("downloadable content") || hText.includes("dlc") ||
                text.includes("requires the base game")) {
                continue;
            }

            const priceEl = block.querySelector(".game_purchase_price, .discount_final_price");
            if (!priceEl) continue;

            const priceText = priceEl.textContent.trim();
            const priceLower = priceText.toLowerCase();

            if (priceLower === "free to play") {
                return { isFree: true, price: "", freeHint: "f2p" };
            }
            if (priceLower === "free" || priceLower === "$0.00" || priceLower === "0,00€" ||
                priceLower === "0₫" || priceLower === "0 ₫") {
                return { isFree: true, price: "", freeHint: "free_game" };
            }
            if (priceLower === "free demo" || text.includes("download demo")) {
                return { isFree: true, price: "", freeHint: "demo" };
            }
            if (text.includes("free to play") || text.includes("play for free")) {
                return { isFree: true, price: "", freeHint: "f2p" };
            }

            if (priceText) {
                return { isFree: false, price: priceText };
            }
        }

        return null;
    };

    /**
     * Scan #gameAreaDLCSection for any DLC row with a non-free price.
     * Used to flag "Has paid DLC" on F2P base games.
     */
    ns.detectPaidDLC = function () {
        const dlcSection = document.querySelector("#gameAreaDLCSection, .game_area_dlc_section");
        if (!dlcSection) return false;

        const dlcRows = dlcSection.querySelectorAll(".game_area_dlc_row");
        for (const row of dlcRows) {
            const priceArea = row.querySelector(".game_area_dlc_price");
            if (!priceArea) continue;

            const priceText = priceArea.textContent.trim().toLowerCase();
            if (priceText && priceText !== "free" && priceText !== "n/a" &&
                !priceText.includes("free") && /\d/.test(priceText)) {
                return true;
            }
        }

        const dlcPurchase = dlcSection.querySelector("#dlc_purchase_action .game_purchase_price");
        if (dlcPurchase) {
            const text = dlcPurchase.textContent.trim().toLowerCase();
            if (text && text !== "free" && /\d/.test(text)) {
                return true;
            }
        }

        return false;
    };
})();
