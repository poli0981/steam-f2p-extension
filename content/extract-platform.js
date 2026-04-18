// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Online/Offline classification and OS-platform extraction.
 */

(function () {
    "use strict";
    const ns = globalThis.SF2P;

    const ONLINE_SIGNALS = [
        "multi-player", "multiplayer", "online multi-player",
        "online pvp", "online co-op", "cross-platform multiplayer",
        "massively multiplayer", "mmo", "mmorpg",
        "pvp", "battle royale", "lan multiplayer",
    ];

    /**
     * Decide online vs offline from Steam category chips + popular tags.
     * @returns {"online"|"offline"}
     */
    ns.detectOnlineOffline = function () {
        const cats = ns.textsOf(
            ".game_area_details_specs a.name, " +
            "#category_block .game_area_details_specs_ctn a, " +
            ".game_area_features_list_ctn a"
        );
        const tags = ns.getPopularTagTexts();
        const all = [...cats, ...tags];

        return all.some((t) => ONLINE_SIGNALS.some((s) => t.includes(s)))
               ? "online" : "offline";
    };

    /**
     * Parse platform icons from the purchase block.
     *
     * HTML: <span class="platform_img win"></span>
     *       <span class="platform_img linux"></span>
     *       <span class="platform_img mac"></span>
     *
     * @returns {string[]} e.g. ["Windows", "Linux"] or ["Windows", "macOS", "Linux"]
     */
    ns.extractPlatforms = function () {
        const platformEls = document.querySelectorAll(
            ".game_area_purchase_platform .platform_img, " +
            ".game_area_purchase_game .platform_img"
        );

        const platformMap = {
            win: "Windows",
            mac: "macOS",
            linux: "Linux",
            steamplay: "Steam Play",
            steamdeck: "Steam Deck",
        };

        const found = new Set();
        for (const el of platformEls) {
            for (const cls of el.classList) {
                if (cls !== "platform_img" && platformMap[cls]) {
                    found.add(platformMap[cls]);
                }
            }
        }

        // Fallback: check sysreq tabs
        if (found.size === 0) {
            const sysreqTabs = document.querySelectorAll(".sysreq_tab, [data-os]");
            for (const tab of sysreqTabs) {
                const os = (tab.dataset.os || tab.textContent).toLowerCase().trim();
                if (os.includes("win")) found.add("Windows");
                if (os.includes("mac")) found.add("macOS");
                if (os.includes("linux") || os.includes("steamos")) found.add("Linux");
            }
        }

        return [...found];
    };
})();
