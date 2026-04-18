// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Content script — Steam store page detector (orchestrator).
 *
 * Runs on store.steampowered.com/app/* pages as the LAST content-script file.
 * All extraction logic lives in the sibling extract-*.js modules, which attach
 * their functions to globalThis.SF2P. This file assembles the result and
 * sends a GAME_DETECTED message to the service worker.
 *
 * Fast path: if the page is a DLC / Demo / Playtest, emit a minimal payload
 * (the popup blocks these from being queued anyway) and skip expensive
 * extractors — anti-cheat dictionary scan, language table, full tag scrape.
 *
 * Re-scan support: the orchestrator's body lives in SF2P.runDetection() and
 * is invoked once at document_idle and again on RESCAN_PAGE messages from
 * the popup. The lib-dom selector cache is cleared before each re-scan.
 */

(function () {
    "use strict";

    const SF2P = globalThis.SF2P;
    if (!SF2P) {
        console.error("[SF2P] Namespace missing — content-script order in manifest.json is wrong");
        return;
    }

    const url = window.location.href;
    const appidMatch = url.match(/store\.steampowered\.com\/app\/(\d+)/);
    if (!appidMatch) return;

    const appid = appidMatch[1];
    const link = `https://store.steampowered.com/app/${appid}/`;

    /**
     * Run the full detection pipeline and send a GAME_DETECTED message.
     * Safe to call multiple times; idempotent besides the outbound message.
     */
    function runDetection() {
        // ── Page type classification (cheap) ──
        const dlcPage = SF2P.isDLCPage();
        const demo = SF2P.isDemo();
        const playtest = SF2P.isPlaytest();

        // ── Fast path: DLC / Demo / Playtest ──
        if (dlcPage || demo || playtest) {
            const gameData = {
                link,
                appid,
                name: SF2P.extractName(),
                header_image: SF2P.extractHeaderImage(),
                genre: SF2P.extractGenre(),
                developer: SF2P.extractDeveloper(),
                is_dlc: dlcPage,
                is_demo: demo,
                is_playtest: playtest,
                free_type: demo ? "demo" : playtest ? "playtest" : "",
                is_free: null,
            };

            chrome.runtime.sendMessage(
                { type: "GAME_DETECTED", data: gameData },
                () => { if (chrome.runtime.lastError) return; }
            );
            return;
        }

        // ── Full path: base game ──

        // Price
        const schemaPrice = SF2P.getBasePriceFromSchema();
        const domPrice = SF2P.getBasePriceFromDOM();

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
            const allLabels = [
                ...SF2P.getPopularTagTexts(),
                ...SF2P.textsOf("#genresAndManufacturer a"),
            ];
            isFree = allLabels.includes("free to play");
            basePrice = "";
            freeHint = isFree ? "f2p" : "";
        }

        const hasPaidDLC = SF2P.detectPaidDLC();
        const freeType = SF2P.classifyFreeType(isFree, hasPaidDLC, freeHint);

        let isFreeResult;
        if (freeType === "f2p" || freeType === "free_game") isFreeResult = true;
        else if (freeType === "paid") isFreeResult = false;
        else isFreeResult = null;

        const typeGame = SF2P.detectOnlineOffline();

        // Only run AC detection for online games — offline titles rarely have AC
        const ac = typeGame === "online"
                   ? SF2P.detectAntiCheat()
                   : { label: "-", note: "", isKernel: null };

        // ── Metadata ──
        const description = SF2P.extractDescription();
        const languages = SF2P.extractLanguages();
        const platforms = SF2P.extractPlatforms();
        const developers = SF2P.extractDeveloper();
        const publishers = SF2P.extractPublisher();
        const allTags = SF2P.extractAllTags();

        // Auto-notes rolled up from detector signals
        const autoNotes = [];
        if (hasPaidDLC) autoNotes.push("Có DLC trả phí");
        if (ac.note) autoNotes.push(ac.note);

        const gameData = {
            link,
            appid,
            name: SF2P.extractName(),
            is_free: isFreeResult,
            is_dlc: false,
            is_demo: false,
            is_playtest: false,
            free_type: freeType,
            has_paid_dlc: hasPaidDLC,
            price: basePrice,
            type_game: typeGame,
            anti_cheat: ac.label,
            anti_cheat_note: ac.note,
            is_kernel_ac: ac.isKernel,
            auto_notes: autoNotes,
            genre: SF2P.extractGenre(),
            developer: developers,
            publisher: publishers,
            release_date: SF2P.extractReleaseDate(),
            header_image: SF2P.extractHeaderImage(),
            description,
            platforms,
            languages: languages.list,
            language_details: languages.details,
            tags: allTags,
        };

        chrome.runtime.sendMessage(
            { type: "GAME_DETECTED", data: gameData },
            () => { if (chrome.runtime.lastError) return; }
        );
    }

    // Expose for rescan
    SF2P.runDetection = runDetection;

    // Initial scan at document_idle (when content scripts load)
    runDetection();

    // Listen for rescan requests from the popup. Clears the lib-dom cache
    // first so late-loading DOM content is picked up.
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg && msg.type === "RESCAN_PAGE") {
            try {
                if (typeof SF2P.clearDomCache === "function") SF2P.clearDomCache();
                runDetection();
                sendResponse({ ok: true });
            } catch (err) {
                sendResponse({ ok: false, error: String(err && err.message || err) });
            }
            return true; // keep the message channel open for async response
        }
        return false;
    });
})();
