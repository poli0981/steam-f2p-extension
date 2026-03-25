// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Content script – Steam store page detector.
 * Runs on store.steampowered.com/app/* pages.
 *
 * Detection strategy:
 *   1. Base price  → schema.org meta[itemprop="price"] (most reliable)
 *                  → fallback to purchase block DOM parsing
 *   2. DLC prices  → #gameAreaDLCSection .game_area_dlc_row (separate section)
 *   3. Free type   → f2p | free_game | demo | playtest | paid
 *   4. Online/Offline → Steam category features
 *   5. Anti-cheat  → dictionary scan with abbreviation + full name + notes
 *
 * MV3: Plain content script (not a module).
 */

(function () {
    "use strict";

    const url = window.location.href;
    const appidMatch = url.match(/store\.steampowered\.com\/app\/(\d+)/);
    if (!appidMatch) return;

    const appid = appidMatch[1];

    // ════════════════════════════════════════════════════════════
    // DOM helpers
    // ════════════════════════════════════════════════════════════

    function textOf(sel) {
        const el = document.querySelector(sel);
        return el ? el.textContent.trim() : "";
    }

    function textsOf(sel) {
        return [...document.querySelectorAll(sel)].map((el) => el.textContent.trim().toLowerCase());
    }

    // ════════════════════════════════════════════════════════════
    // 1. Base price detection
    // ════════════════════════════════════════════════════════════

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
    function getBasePriceFromSchema() {
        // Get all Offer itemscopes
        const offers = document.querySelectorAll('[itemtype="http://schema.org/Offer"]');

        for (const offer of offers) {
            // Skip offers inside the DLC section
            if (offer.closest("#gameAreaDLCSection, .game_area_dlc_section, .game_area_dlc_list")) {
                continue;
            }

            const priceMeta = offer.querySelector('meta[itemprop="price"]');
            const currencyMeta = offer.querySelector('meta[itemprop="priceCurrency"]');

            if (priceMeta) {
                const rawPrice = (priceMeta.getAttribute("content") || "").trim();
                const currency = (currencyMeta?.getAttribute("content") || "").trim();

                // Parse numeric value: e.g: "0" → 0, "82.500" → 82500 (localized), "9.99" → 9.99
                // Steam uses period as thousands separator for VND (82.500 = 82500₫)
                // but as decimal separator for USD (9.99 = $9.99)
                const numericStr = rawPrice.replace(/\./g, "").replace(",", ".");
                const value = parseFloat(numericStr);

                if (!isNaN(value) && value === 0) {
                    return {isFree: true, price: "", currency};
                }
                if (!isNaN(value) && value > 0) {
                    // Format display price
                    return {isFree: false, price: rawPrice + (currency ? ` ${currency}` : ""), currency};
                }
            }
        }

        return null; // schema not found or unparseable
    }

    /**
     * Fallback: parse purchase blocks in the DOM.
     * Skip bundles. Skip DLC blocks. Only look at base game.
     */
    function getBasePriceFromDOM() {
        const blocks = document.querySelectorAll(".game_area_purchase_game");

        for (const block of blocks) {
            // Skip if inside DLC section
            if (block.closest("#gameAreaDLCSection, .game_area_dlc_section")) continue;

            const text = block.textContent.toLowerCase();
            const heading = block.querySelector("h1");
            const hText = heading ? heading.textContent.toLowerCase() : "";

            // Skip bundles
            if (hText.includes("bundle") || hText.includes("package") ||
                text.includes("items included in this bundle") ||
                text.includes("items included in this package")) {
                continue;
            }

            // Skip DLC purchase blocks embedded in main area
            if (hText.includes("downloadable content") || hText.includes("dlc") ||
                text.includes("requires the base game")) {
                continue;
            }

            // Get price element
            const priceEl = block.querySelector(".game_purchase_price, .discount_final_price");
            if (!priceEl) continue;

            const priceText = priceEl.textContent.trim();
            const priceLower = priceText.toLowerCase();

            // Free checks
            if (priceLower === "free to play") {
                return {isFree: true, price: "", freeHint: "f2p"};
            }
            if (priceLower === "free" || priceLower === "$0.00" || priceLower === "0,00€" ||
                priceLower === "0₫" || priceLower === "0 ₫") {
                return {isFree: true, price: "", freeHint: "free_game"};
            }
            if (priceLower === "free demo" || text.includes("download demo")) {
                return {isFree: true, price: "", freeHint: "demo"};
            }

            // Also check the block text for "free to play" even if price element is weird
            if (text.includes("free to play") || text.includes("play for free")) {
                return {isFree: true, price: "", freeHint: "f2p"};
            }

            // Paid — capture base price
            if (priceText) {
                return {isFree: false, price: priceText};
            }
        }

        return null;
    }

    // ════════════════════════════════════════════════════════════
    // 2. DLC price detection
    // ════════════════════════════════════════════════════════════

    /**
     * Check #gameAreaDLCSection for paid DLC rows.
     * DLC rows are in .game_area_dlc_row with prices in .game_area_dlc_price.
     */
    function detectPaidDLC() {
        const dlcSection = document.querySelector("#gameAreaDLCSection, .game_area_dlc_section");
        if (!dlcSection) return false;

        const dlcRows = dlcSection.querySelectorAll(".game_area_dlc_row");
        for (const row of dlcRows) {
            const priceArea = row.querySelector(".game_area_dlc_price");
            if (!priceArea) continue;

            const priceText = priceArea.textContent.trim().toLowerCase();

            // Has a real price (not free)
            if (priceText && priceText !== "free" && priceText !== "n/a" && priceText !== "" &&
                !priceText.includes("free")) {
                // Check for numeric price indicators
                if (/\d/.test(priceText)) {
                    return true;
                }
            }
        }

        // Fallback: check the "Add all DLC to Cart" button area
        const dlcPurchase = dlcSection.querySelector("#dlc_purchase_action .game_purchase_price");
        if (dlcPurchase) {
            const text = dlcPurchase.textContent.trim().toLowerCase();
            if (text && text !== "free" && /\d/.test(text)) {
                return true;
            }
        }

        return false;
    }

    // ════════════════════════════════════════════════════════════
    // 3. Free type classification
    // ════════════════════════════════════════════════════════════

    function classifyFreeType(isFree, hasPaidDLC, freeHint) {
        if (!isFree) return "paid";
        if (freeHint === "demo") return "demo";
        if (freeHint === "f2p") return "f2p";

        // Detect from tags/categories
        const allLabels = [
            ...textsOf(".glance_tags.popular_tags a, .app_tag"),
            ...textsOf("#genresAndManufacturer a"),
        ];

        const hasF2PTag = allLabels.includes("free to play");
        const hasInApp = allLabels.some((t) =>
            t.includes("in-app") || t.includes("microtransaction") || t.includes("in app")
        );

        if (hasF2PTag || hasInApp || hasPaidDLC) return "f2p";
        return "free_game";
    }

    // ════════════════════════════════════════════════════════════
    // 4. DLC page detection (this page IS a DLC, not a base game)
    // ════════════════════════════════════════════════════════════

    function isDLCPage() {
        if (document.querySelector(".game_area_dlc_bubble")) return true;

        const crumbs = textsOf(".blockbg a, .breadcrumbs a");
        if (crumbs.some((t) => t.includes("downloadable content"))) return true;

        const genreArea = document.querySelector("#genresAndManufacturer");
        if (genreArea && genreArea.textContent.toLowerCase().includes("downloadable content")) return true;

        return false;
    }

    // ════════════════════════════════════════════════════════════
    // 5. Demo / Playtest detection
    // ════════════════════════════════════════════════════════════

    function isDemo() {
        const crumbs = textsOf(".blockbg a, .breadcrumbs a");
        if (crumbs.some((t) => t === "demo" || t === "demos")) return true;

        const purchaseText = textOf(".game_area_purchase_game_wrapper").toLowerCase();
        if (purchaseText.includes("download demo") && !purchaseText.includes("play game")) return true;

        const name = textOf(".apphub_AppName").toLowerCase();
        if (name.endsWith(" demo") || name.includes(" demo ") || name.startsWith("demo ")) return true;

        return false;
    }

    function isPlaytest() {
        const purchaseText = textOf(".game_area_purchase_game_wrapper").toLowerCase();
        if (purchaseText.includes("join playtest") || purchaseText.includes("request access")) return true;

        const name = textOf(".apphub_AppName").toLowerCase();
        if (name.includes("playtest")) return true;

        if (document.querySelector("[data-featuretarget='playtest-section']")) return true;

        return false;
    }

    // ════════════════════════════════════════════════════════════
    // 6. Online / Offline
    // ════════════════════════════════════════════════════════════

    function detectOnlineOffline() {
        const cats = textsOf(
            ".game_area_details_specs a.name, " +
            "#category_block .game_area_details_specs_ctn a, " +
            ".game_area_features_list_ctn a"
        );
        const tags = textsOf(".glance_tags.popular_tags a, .app_tag");
        const all = [...cats, ...tags];

        const onlineSignals = [
            "multi-player", "multiplayer", "online multi-player",
            "online pvp", "online co-op", "cross-platform multiplayer",
            "massively multiplayer", "mmo", "mmorpg",
            "pvp", "battle royale", "lan multiplayer",
        ];

        return all.some((t) => onlineSignals.some((s) => t.includes(s)))
            ? "online" : "offline";
    }

    // ════════════════════════════════════════════════════════════
    // 7. Anti-cheat detection
    //
    // Two-pass strategy:
    //   Pass 1 (primary): Parse Steam's structured .anticheat_section elements.
    //     These provide the official AC name and kernel/non-kernel classification.
    //     HTML structure:
    //       <div class="anticheat_section anticheat_nonkernel_notice">  ← non-kernel
    //         <div>Uses Anti-Cheat Software</div>
    //         <div class="anticheat_name">NetEase Game Security</div>
    //       </div>
    //       <div class="anticheat_section DRM_notice">                 ← kernel-level
    //         <div>Uses Kernel Level Anti-Cheat</div>
    //         <div class="anticheat_name">KSS (Krafton Security Services)</div>
    //       </div>
    //
    //   Pass 2 (fallback): Dictionary pattern scan on page text zones.
    //     For games that don't use Steam's structured section.
    //
    // ════════════════════════════════════════════════════════════

    // Dictionary maps known AC names (lowercased) to short labels.
    // Used for both structured section name matching and fallback scan.
    const ANTI_CHEAT_DB = [
        {label: "VAC", patterns: ["valve anti-cheat", "valve anti cheat", "vac enabled", "vac secured", "vac"]},
        {label: "EAC", patterns: ["easy anti-cheat", "easy anti cheat", "easyanticheat", "eac anti-cheat"]},
        {label: "BattlEye", patterns: ["battleye", "battle eye", "be anti-cheat"]},
        {label: "Vanguard", patterns: ["vanguard", "riot vanguard"]},
        {label: "PunkBuster", patterns: ["punkbuster", "punk buster", "evenbalance"]},
        {label: "nProtect", patterns: ["nprotect", "gameguard", "nprotect gameguard"]},
        {label: "XIGNCODE", patterns: ["xigncode", "xigncode3"]},
        {label: "Ricochet", patterns: ["ricochet anti-cheat", "ricochet"]},
        {label: "mHyprot", patterns: ["mhyprot", "mhyprot2"]},
        {label: "FACEIT AC", patterns: ["faceit anti-cheat", "faceit ac"]},
        {label: "Denuvo AC", patterns: ["denuvo anti-cheat", "denuvo anti cheat"]},
        {label: "Zakynthos", patterns: ["zakynthos"]},
        {label: "Treyarch AC", patterns: ["treyarch anti-cheat"]},
        {label: "Hyperion", patterns: ["hyperion", "byfron"]},
        {label: "KSS", patterns: ["kss", "krafton security"]},
        {label: "NetEase GS", patterns: ["netease game security", "netease anti-cheat"]},
        {label: "Nexon GP", patterns: ["nexon game security", "game police"]},
        {label: "miHoYo AC", patterns: ["mihoyo", "hoyoverse anti-cheat"]},
        {label: "AhnLab", patterns: ["ahnlab", "hackshield"]},
        {label: "Wellbia", patterns: ["wellbia", "xhunter"]},
    ];

    /**
     * Look up a short label for an AC name string using the dictionary.
     * @param {string} rawName - e.g. "KSS (Krafton Security Services)"
     * @returns {string|null} Short label or null if not in dictionary
     */
    function lookupACLabel(rawName) {
        const lower = rawName.toLowerCase();
        for (const entry of ANTI_CHEAT_DB) {
            for (const pat of entry.patterns) {
                if (lower.includes(pat)) return entry.label;
            }
        }
        return null;
    }

    /**
     * Detect anti-cheat from the page.
     *
     * Returns {
     *   label:    "VAC" | "EAC" | ... | raw name | "-"
     *   note:     "Valve Anti-Cheat (VAC) [Kernel]" | ""
     *   isKernel: true | false | null (unknown)
     * }
     */
    function detectAntiCheat() {
        // ── Pass 1: Steam structured .anticheat_section ──
        const sections = document.querySelectorAll(".anticheat_section");

        if (sections.length > 0) {
            const results = [];

            for (const section of sections) {
                const nameEl = section.querySelector(".anticheat_name");
                if (!nameEl) continue;

                // Extract raw name — strip the "uninstalls" span text
                const uninstallSpan = nameEl.querySelector(".anticheat_uninstalls");
                let rawName = nameEl.textContent.trim();
                if (uninstallSpan) {
                    rawName = rawName.replace(uninstallSpan.textContent, "").trim();
                }
                if (!rawName) continue;

                // Determine kernel vs non-kernel from section classes
                const isKernel = section.classList.contains("DRM_notice") ||
                    section.textContent.toLowerCase().includes("kernel level");
                const isNonKernel = section.classList.contains("anticheat_nonkernel_notice");

                // Determine kernel classification
                let kernelType;
                if (isKernel) kernelType = "kernel";
                else if (isNonKernel) kernelType = "non-kernel";
                else kernelType = "unknown";

                // Map to short label via dictionary, or use raw name
                const shortLabel = lookupACLabel(rawName) || rawName;

                // Build note with full name + kernel classification
                const kernelTag = kernelType === "kernel" ? " [Kernel]"
                    : kernelType === "non-kernel" ? " [Non-Kernel]"
                        : "";
                const note = `${rawName}${kernelTag}`;

                results.push({
                    label: shortLabel,
                    note,
                    isKernel: kernelType === "kernel" ? true
                        : kernelType === "non-kernel" ? false
                            : null,
                });
            }

            if (results.length === 1) {
                return results[0];
            }

            if (results.length > 1) {
                // Multiple AC systems — combine into one result
                // Prioritize kernel-level one for label if present
                const kernelOne = results.find((r) => r.isKernel === true);
                const primary = kernelOne || results[0];

                return {
                    label: results.map((r) => r.label).join(" + "),
                    note: results.map((r) => r.note).join("; "),
                    isKernel: results.some((r) => r.isKernel === true) ? true
                        : results.every((r) => r.isKernel === false) ? false
                            : null,
                };
            }
        }

        // ── Pass 2: Fallback — dictionary scan on page text ──
        const zones = [
            textsOf(".game_area_details_specs a").join(" "),
            textOf(".DRM_notice, .drm_notice, .game_area_legal").toLowerCase(),
            textOf("#game_area_legal, .eula_text").toLowerCase(),
            textOf(".game_area_sys_req_leftCol, .game_area_sys_req_rightCol, .game_area_sys_req_full").toLowerCase(),
            textOf(".game_area_description").toLowerCase(),
        ];
        const searchText = zones.join(" ");

        for (const ac of ANTI_CHEAT_DB) {
            for (const pattern of ac.patterns) {
                if (searchText.includes(pattern)) {
                    // Can't determine kernel level from text scan
                    return {label: ac.label, note: ac.label, isKernel: null};
                }
            }
        }

        return {label: "-", note: "", isKernel: null};
    }

    // ════════════════════════════════════════════════════════════
    // Other extractors
    // ════════════════════════════════════════════════════════════

    function extractGenre() {
        const genreLinks = document.querySelectorAll("#genresAndManufacturer a[href*='/genre/']");
        const skip = new Set(["free to play"]);
        for (const link of genreLinks) {
            const t = link.textContent.trim();
            if (t && !skip.has(t.toLowerCase())) return t;
        }
        const tags = document.querySelectorAll(".glance_tags.popular_tags a");
        const skipTags = new Set([
            "free to play", "indie", "casual", "early access",
            "multiplayer", "singleplayer", "co-op",
        ]);
        for (const tag of tags) {
            const t = tag.textContent.trim();
            if (t && !skipTags.has(t.toLowerCase())) return t;
        }
        return "";
    }

    function extractDeveloper() {
        const devLink = document.querySelector("#developers_list a");
        if (devLink) return devLink.textContent.trim();
        return "";
    }

    function extractReleaseDate() {
        return textOf(".release_date .date");
    }

    function extractHeaderImage() {
        const img = document.querySelector(".game_header_image_full");
        if (img) return img.src || "";
        const fb = document.querySelector("img.game_header_image");
        if (fb) return fb.src || "";
        return "";
    }

    function extractName() {
        return textOf(".apphub_AppName") ||
            (document.title || "").replace(/\s*on\s*Steam.*$/i, "").trim();
    }

    // ════════════════════════════════════════════════════════════
    // Build and send
    // ════════════════════════════════════════════════════════════

    const dlcPage = isDLCPage();
    const demo = isDemo();
    const playtest = isPlaytest();

    // Price: try schema.org first, then DOM parsing
    const schemaPrice = getBasePriceFromSchema();
    const domPrice = getBasePriceFromDOM();

    let isFree, basePrice, freeHint;
    if (schemaPrice) {
        isFree = schemaPrice.isFree;
        basePrice = schemaPrice.price;
        freeHint = schemaPrice.isFree ? (domPrice?.freeHint || "") : "";
    } else if (domPrice) {
        isFree = domPrice.isFree;
        basePrice = domPrice.price || "";
        freeHint = domPrice.freeHint || "";
    } else {
        // No price info found — check tags as last resort
        const allLabels = [
            ...textsOf(".glance_tags.popular_tags a, .app_tag"),
            ...textsOf("#genresAndManufacturer a"),
        ];
        isFree = allLabels.includes("free to play");
        basePrice = "";
        freeHint = isFree ? "f2p" : "";
    }

    // DLC detection (separate from base price)
    const hasPaidDLC = detectPaidDLC();

    // Free type classification
    let freeType;
    if (demo) freeType = "demo";
    else if (playtest) freeType = "playtest";
    else freeType = classifyFreeType(isFree, hasPaidDLC, freeHint);

    // Final is_free: true for f2p/free_game, false for paid, null for demo/playtest
    let isFreeResult;
    if (freeType === "f2p" || freeType === "free_game") isFreeResult = true;
    else if (freeType === "paid") isFreeResult = false;
    else isFreeResult = null; // demo, playtest

    // Online / offline
    const typeGame = detectOnlineOffline();

    // Anti-cheat (only detect for online games — saves scanning time)
    const ac = typeGame === "online"
        ? detectAntiCheat()
        : {label: "-", note: "", isKernel: null};

    // Build auto-notes
    const autoNotes = [];
    if (hasPaidDLC) autoNotes.push("Có DLC trả phí");
    if (ac.note) autoNotes.push(ac.note);

    const gameData = {
        link: `https://store.steampowered.com/app/${appid}/`,
        appid,
        name: extractName(),
        is_free: isFreeResult,
        is_dlc: dlcPage,
        is_demo: demo,
        is_playtest: playtest,
        free_type: freeType,
        has_paid_dlc: hasPaidDLC,
        price: basePrice,
        type_game: typeGame,
        anti_cheat: ac.label,              // Short label: "VAC", "EAC + BattlEye", "-"
        anti_cheat_note: ac.note,          // Full name: "KSS (Krafton Security Services) [Kernel]"
        is_kernel_ac: ac.isKernel,         // true = kernel-level, false = non-kernel, null = unknown
        auto_notes: autoNotes,
        genre: extractGenre(),
        developer: extractDeveloper(),
        release_date: extractReleaseDate(),
        header_image: extractHeaderImage(),
    };

    chrome.runtime.sendMessage(
        {type: "GAME_DETECTED", data: gameData},
        () => {
            if (chrome.runtime.lastError) return;
        }
    );
})();
