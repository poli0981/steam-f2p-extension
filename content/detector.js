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
 *   5. Anti-cheat  → Pass 1: Steam structured .anticheat_section
 *                  → Pass 2: Dictionary pattern scan on page text
 *   6. Description → .game_description_snippet
 *   7. Languages   → #languageTable .game_language_options
 *   8. Platforms    → .game_area_purchase_platform .platform_img
 *   9. Publisher    → .dev_row (second instance)
 *  10. Tags (full)  → .glance_tags.popular_tags a (all tags including hidden)
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
    }

    /**
     * Fallback: parse purchase blocks in the DOM.
     */
    function getBasePriceFromDOM() {
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
    }

    // ════════════════════════════════════════════════════════════
    // 2. DLC price detection
    // ════════════════════════════════════════════════════════════

    function detectPaidDLC() {
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
    }

    // ════════════════════════════════════════════════════════════
    // 3. Free type classification
    // ════════════════════════════════════════════════════════════

    function classifyFreeType(isFree, hasPaidDLC, freeHint) {
        if (!isFree) return "paid";
        if (freeHint === "demo") return "demo";
        if (freeHint === "f2p") return "f2p";

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
    // 4. DLC page / Demo / Playtest detection
    // ════════════════════════════════════════════════════════════

    function isDLCPage() {
        if (document.querySelector(".game_area_dlc_bubble")) return true;
        const crumbs = textsOf(".blockbg a, .breadcrumbs a");
        if (crumbs.some((t) => t.includes("downloadable content"))) return true;
        const genreArea = document.querySelector("#genresAndManufacturer");
        if (genreArea && genreArea.textContent.toLowerCase().includes("downloadable content")) return true;
        return false;
    }

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
    // 5. Online / Offline
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
    // 6. Anti-cheat detection (two-pass)
    // ════════════════════════════════════════════════════════════

    const ANTI_CHEAT_DB = [
        { label: "VAC", patterns: ["valve anti-cheat", "valve anti cheat", "vac enabled", "vac secured", "vac"] },
        { label: "EAC", patterns: ["easy anti-cheat", "easy anti cheat", "easyanticheat", "eac anti-cheat"] },
        { label: "BattlEye", patterns: ["battleye", "battle eye", "be anti-cheat"] },
        { label: "Vanguard", patterns: ["vanguard", "riot vanguard"] },
        { label: "PunkBuster", patterns: ["punkbuster", "punk buster", "evenbalance"] },
        { label: "nProtect", patterns: ["nprotect", "gameguard", "nprotect gameguard"] },
        { label: "XIGNCODE", patterns: ["xigncode", "xigncode3"] },
        { label: "Ricochet", patterns: ["ricochet anti-cheat", "ricochet"] },
        { label: "mHyprot", patterns: ["mhyprot", "mhyprot2"] },
        { label: "FACEIT AC", patterns: ["faceit anti-cheat", "faceit ac"] },
        { label: "Denuvo AC", patterns: ["denuvo anti-cheat", "denuvo anti cheat"] },
        { label: "Zakynthos", patterns: ["zakynthos"] },
        { label: "Treyarch AC", patterns: ["treyarch anti-cheat"] },
        { label: "Hyperion", patterns: ["hyperion", "byfron"] },
        { label: "KSS", patterns: ["kss", "krafton security"] },
        { label: "NetEase GS", patterns: ["netease game security", "netease anti-cheat"] },
        { label: "Nexon GP", patterns: ["nexon game security", "game police"] },
        { label: "miHoYo AC", patterns: ["mihoyo", "hoyoverse anti-cheat"] },
        { label: "AhnLab", patterns: ["ahnlab", "hackshield"] },
        { label: "Wellbia", patterns: ["wellbia", "xhunter"] },
    ];

    function lookupACLabel(rawName) {
        const lower = rawName.toLowerCase();
        for (const entry of ANTI_CHEAT_DB) {
            for (const pat of entry.patterns) {
                if (lower.includes(pat)) return entry.label;
            }
        }
        return null;
    }

    function detectAntiCheat() {
        // ── Pass 1: Steam structured .anticheat_section ──
        const sections = document.querySelectorAll(".anticheat_section");

        if (sections.length > 0) {
            const results = [];

            for (const section of sections) {
                const nameEl = section.querySelector(".anticheat_name");
                if (!nameEl) continue;

                const uninstallSpan = nameEl.querySelector(".anticheat_uninstalls");
                let rawName = nameEl.textContent.trim();
                if (uninstallSpan) {
                    rawName = rawName.replace(uninstallSpan.textContent, "").trim();
                }
                if (!rawName) continue;

                const isKernel = section.classList.contains("DRM_notice") ||
                                 section.textContent.toLowerCase().includes("kernel level");
                const isNonKernel = section.classList.contains("anticheat_nonkernel_notice");

                let kernelType;
                if (isKernel) kernelType = "kernel";
                else if (isNonKernel) kernelType = "non-kernel";
                else kernelType = "unknown";

                const shortLabel = lookupACLabel(rawName) || rawName;
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

            if (results.length === 1) return results[0];

            if (results.length > 1) {
                return {
                    label: results.map((r) => r.label).join(" + "),
                    note: results.map((r) => r.note).join("; "),
                    isKernel: results.some((r) => r.isKernel === true) ? true
                                                                       : results.every((r) => r.isKernel === false) ? false
                                                                                                                    : null,
                };
            }
        }

        // ── Pass 2: Fallback dictionary scan ──
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
                    return { label: ac.label, note: ac.label, isKernel: null };
                }
            }
        }

        return { label: "-", note: "", isKernel: null };
    }

    // ════════════════════════════════════════════════════════════
    // 7. Description
    // ════════════════════════════════════════════════════════════

    function extractDescription() {
        const snippet = document.querySelector(".game_description_snippet");
        if (snippet) {
            return snippet.textContent.trim();
        }
        // Fallback: first paragraph of the full description
        const fullDesc = document.querySelector("#game_area_description .game_area_description");
        if (fullDesc) {
            const firstP = fullDesc.querySelector("p, h2");
            if (firstP) return firstP.textContent.trim();
        }
        return "";
    }

    // ════════════════════════════════════════════════════════════
    // 8. Languages — parse table
    // ════════════════════════════════════════════════════════════

    /**
     * Parse #languageTable to extract language support.
     *
     * HTML structure:
     *   <table class="game_language_options">
     *     <tr><th></th><th>Interface</th><th>Full Audio</th><th>Subtitles</th></tr>
     *     <tr>
     *       <td class="ellipsis">English</td>
     *       <td class="checkcol"><span>✔</span></td>  ← interface
     *       <td class="checkcol"></td>                  ← no audio
     *       <td class="checkcol"></td>                  ← no subtitles
     *     </tr>
     *     <tr class="unsupported">                      ← UNSUPPORTED row (skipped)
     *       <td class="ellipsis">Arabic</td>
     *       <td colspan="3">Not supported</td>
     *     </tr>
     *   </table>
     *
     * Skipping rules:
     *   - Row has class="unsupported" (Steam's explicit marker)
     *   - Defensive: no checkmark in any of interface/audio/subtitles
     *
     * Returns: {
     *   list: ["English", "Japanese", "Simplified Chinese"],
     *   details: [
     *     { name: "English", interface: true, audio: false, subtitles: false },
     *     ...
     *   ]
     * }
     */
    function extractLanguages() {
        const table = document.querySelector("#languageTable .game_language_options");
        if (!table) return { list: [], details: [] };

        const rows = table.querySelectorAll("tr");
        const list = [];
        const details = [];

        for (const row of rows) {
            // Skip rows Steam explicitly marks as unsupported
            if (row.classList.contains("unsupported")) continue;

            const cells = row.querySelectorAll("td");
            if (cells.length < 2) continue; // skip header row

            const langName = cells[0]?.textContent?.trim();
            if (!langName) continue;

            const hasCheck = (cell) => !!(cell && cell.querySelector("span"));

            const entry = {
                name: langName,
                interface: hasCheck(cells[1]),
                audio: hasCheck(cells[2]),
                subtitles: hasCheck(cells[3]),
            };

            // Defensive: skip rows with no support signal at all
            // (catches edge cases where Steam omits the "unsupported" class)
            if (!entry.interface && !entry.audio && !entry.subtitles) continue;

            list.push(langName);
            details.push(entry);
        }

        return { list, details };
    }

    // ════════════════════════════════════════════════════════════
    // 9. Platforms
    // ════════════════════════════════════════════════════════════

    /**
     * Parse platform icons from purchase block.
     *
     * HTML: <span class="platform_img win"></span>
     *       <span class="platform_img linux"></span>
     *       <span class="platform_img mac"></span>
     *
     * Returns: ["Windows", "Linux"] or ["Windows", "macOS", "Linux"]
     */
    function extractPlatforms() {
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
    }

    /**
     * Extract names from the #appHeaderGridContainer grid layout.
     * Used by both developer and publisher extractors.
     *
     * HTML structure (>=2 devs/pubs):
     *   <div id="appHeaderGridContainer">
     *     <div class="grid_label">Developer</div>
     *     <div class="grid_content">
     *       <a>DONTNOD Entertainment</a>, <a>Feral Interactive (Mac)</a>
     *     </div>
     *     <div class="grid_label">Publisher</div>
     *     <div class="grid_content">
     *       <a>Square Enix</a>, <a>Feral interactive (Mac)</a>
     *     </div>
     *   </div>
     *
     * @param {string} labelMatch - "developer" or "publisher" (case-insensitive)
     * @returns {string[]}
     */
    function extractFromGridLayout(labelMatch) {
        const gridContainer = document.querySelector("#appHeaderGridContainer");
        if (!gridContainer) return [];

        const labels = gridContainer.querySelectorAll(".grid_label");
        for (const label of labels) {
            if (label.textContent.trim().toLowerCase().includes(labelMatch)) {
                const content = label.nextElementSibling;
                if (content && content.classList.contains("grid_content")) {
                    const links = content.querySelectorAll("a");
                    if (links.length > 0) {
                        return [...links].map((a) => a.textContent.trim()).filter(Boolean);
                    }
                    // No links — try splitting by comma
                    const raw = content.textContent.trim();
                    if (raw) {
                        return raw.split(",").map((s) => s.trim()).filter(Boolean);
                    }
                }
            }
        }

        return [];
    }

    // ════════════════════════════════════════════════════════════
    // 10. Publisher
    // ════════════════════════════════════════════════════════════

    /**
     * Extract publisher(s).
     *
     * Two Steam layouts:
     *   Layout 1 (single pub): .dev_row with subtitle "Publisher:" → one <a>
     *   Layout 2 (multi pub):  #appHeaderGridContainer .grid_label "Publisher"
     *                          → .grid_content with multiple <a> tags
     *
     * Returns: string[] — e.g. ["MILQ Games"] or ["Square Enix", "Feral interactive (Mac)"]
     */
    function extractPublisher() {
        // ── Layout 1: .dev_row ──
        const rows = document.querySelectorAll(".dev_row");
        for (const row of rows) {
            const subtitle = row.querySelector(".subtitle");
            if (subtitle && subtitle.textContent.trim().toLowerCase().includes("publisher")) {
                const links = row.querySelectorAll(".summary a");
                if (links.length > 0) {
                    return [...links].map((a) => a.textContent.trim()).filter(Boolean);
                }
                const summary = row.querySelector(".summary");
                if (summary) {
                    const text = summary.textContent.trim();
                    if (text) return [text];
                }
            }
        }

        // ── Layout 2: #appHeaderGridContainer grid ──
        const pubNames = extractFromGridLayout("publisher");
        if (pubNames.length > 0) return pubNames;

        return [];
    }

    // ════════════════════════════════════════════════════════════
    // 11. Tags (full list including hidden)
    // ════════════════════════════════════════════════════════════

    /**
     * Extract all user-defined tags from the popular tags section.
     * Includes tags with display:none (Steam hides overflow tags).
     *
     * Returns: ["Action", "Puzzle", "2D", "Controller", "Pixel Graphics", ...]
     */
    function extractAllTags() {
        const tagEls = document.querySelectorAll(".glance_tags.popular_tags a.app_tag");
        const tags = [];
        for (const el of tagEls) {
            const t = el.textContent.trim();
            if (t && t !== "+") tags.push(t);
        }
        return tags;
    }

    // ════════════════════════════════════════════════════════════
    // Existing extractors
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

    /**
     * Extract developer(s).
     *
     * Two Steam layouts:
     *   Layout 1 (single dev): .dev_row with #developers_list containing one <a>
     *   Layout 2 (multi dev):  #appHeaderGridContainer with .grid_label "Developer"
     *                          followed by .grid_content containing multiple <a> tags
     *
     * Returns: string[] — e.g. ["MILQ Games"] or ["DONTNOD Entertainment", "Feral Interactive (Mac)"]
     */
    function extractDeveloper() {
        // ── Layout 1: .dev_row #developers_list ──
        const devList = document.querySelector("#developers_list");
        if (devList) {
            const links = devList.querySelectorAll("a");
            if (links.length > 0) {
                const names = [...links].map((a) => a.textContent.trim()).filter(Boolean);
                if (names.length > 0) return names;
            }
        }

        // ── Layout 2: #appHeaderGridContainer grid ──
        const devNames = extractFromGridLayout("developer");
        if (devNames.length > 0) return devNames;

        // ── Fallback: any .dev_row with "Developer" label ──
        const rows = document.querySelectorAll(".dev_row");
        for (const row of rows) {
            const subtitle = row.querySelector(".subtitle");
            if (subtitle && subtitle.textContent.trim().toLowerCase().includes("developer")) {
                const links = row.querySelectorAll(".summary a");
                if (links.length > 0) {
                    return [...links].map((a) => a.textContent.trim()).filter(Boolean);
                }
                const summary = row.querySelector(".summary");
                if (summary) {
                    const text = summary.textContent.trim();
                    if (text) return [text];
                }
            }
        }

        return [];
    }

    /**
     * Extract release date.
     *
     * Layout 1: .release_date .date
     * Layout 2: #appHeaderGridContainer .grid_date
     */
    function extractReleaseDate() {
        // Layout 1
        const dateEl = document.querySelector(".release_date .date");
        if (dateEl) {
            const text = dateEl.textContent.trim();
            if (text) return text;
        }

        // Layout 2: grid layout
        const gridContainer = document.querySelector("#appHeaderGridContainer");
        if (gridContainer) {
            const labels = gridContainer.querySelectorAll(".grid_label");
            for (const label of labels) {
                if (label.textContent.trim().toLowerCase().includes("released")) {
                    const content = label.nextElementSibling;
                    if (content && content.classList.contains("grid_content")) {
                        const text = content.textContent.trim();
                        if (text) return text;
                    }
                }
            }
        }

        return "";
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

    // Price
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
        const allLabels = [
            ...textsOf(".glance_tags.popular_tags a, .app_tag"),
            ...textsOf("#genresAndManufacturer a"),
        ];
        isFree = allLabels.includes("free to play");
        basePrice = "";
        freeHint = isFree ? "f2p" : "";
    }

    const hasPaidDLC = detectPaidDLC();

    let freeType;
    if (demo) freeType = "demo";
    else if (playtest) freeType = "playtest";
    else freeType = classifyFreeType(isFree, hasPaidDLC, freeHint);

    let isFreeResult;
    if (freeType === "f2p" || freeType === "free_game") isFreeResult = true;
    else if (freeType === "paid") isFreeResult = false;
    else isFreeResult = null;

    const typeGame = detectOnlineOffline();

    const ac = typeGame === "online"
               ? detectAntiCheat()
               : { label: "-", note: "", isKernel: null };

    // ── New extractors ──
    const description = extractDescription();
    const languages = extractLanguages();
    const platforms = extractPlatforms();
    const developers = extractDeveloper();   // string[]
    const publishers = extractPublisher();   // string[]
    const allTags = extractAllTags();

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
        anti_cheat: ac.label,
        anti_cheat_note: ac.note,
        is_kernel_ac: ac.isKernel,
        auto_notes: autoNotes,
        // Existing
        genre: extractGenre(),
        developer: developers,               // ["MILQ Games"] or ["DONTNOD", "Feral Interactive"]
        publisher: publishers,               // ["Square Enix"] or ["Square Enix", "Feral Interactive"]
        release_date: extractReleaseDate(),
        header_image: extractHeaderImage(),
        // New fields
        description,
        platforms,                           // ["Windows", "Linux"]
        languages: languages.list,           // ["English", "Japanese", ...]
        language_details: languages.details,  // [{ name, interface, audio, subtitles }, ...]
        tags: allTags,                       // ["Action", "Puzzle", "2D", ...]
    };

    chrome.runtime.sendMessage(
        { type: "GAME_DETECTED", data: gameData },
        () => {
            if (chrome.runtime.lastError) return;
        }
    );
})();
