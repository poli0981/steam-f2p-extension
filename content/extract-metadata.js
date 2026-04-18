// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Textual metadata extractors: description, developer, publisher, release date,
 * header image, name, genre.
 */

(function () {
    "use strict";
    const ns = globalThis.SF2P;

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
     *   </div>
     *
     * @param {string} labelMatch - "developer" or "publisher" (case-insensitive)
     * @returns {string[]}
     */
    ns.extractFromGridLayout = function (labelMatch) {
        const gridContainer = ns.getGridContainer();
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
                    const raw = content.textContent.trim();
                    if (raw) {
                        return raw.split(",").map((s) => s.trim()).filter(Boolean);
                    }
                }
            }
        }

        return [];
    };

    /**
     * Short description from the game_description_snippet or first paragraph.
     */
    ns.extractDescription = function () {
        const snippet = document.querySelector(".game_description_snippet");
        if (snippet) {
            return snippet.textContent.trim();
        }
        const fullDesc = document.querySelector("#game_area_description .game_area_description");
        if (fullDesc) {
            const firstP = fullDesc.querySelector("p, h2");
            if (firstP) return firstP.textContent.trim();
        }
        return "";
    };

    /**
     * Extract developer(s).
     *
     * Layout 1 (single dev): .dev_row with #developers_list containing links
     * Layout 2 (multi dev):  #appHeaderGridContainer grid
     * Layout 3 (fallback):   .dev_row with "Developer" subtitle
     */
    ns.extractDeveloper = function () {
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
        const devNames = ns.extractFromGridLayout("developer");
        if (devNames.length > 0) return devNames;

        // ── Fallback: any .dev_row with "Developer" label ──
        for (const row of ns.getDevRows()) {
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
    };

    /**
     * Extract publisher(s).
     *
     * Layout 1 (single pub): .dev_row with "Publisher:" subtitle
     * Layout 2 (multi pub):  #appHeaderGridContainer grid
     */
    ns.extractPublisher = function () {
        // ── Layout 1: .dev_row ──
        for (const row of ns.getDevRows()) {
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
        const pubNames = ns.extractFromGridLayout("publisher");
        if (pubNames.length > 0) return pubNames;

        return [];
    };

    /**
     * Extract release date.
     * Layout 1: .release_date .date
     * Layout 2: #appHeaderGridContainer "Released" label
     */
    ns.extractReleaseDate = function () {
        const dateEl = document.querySelector(".release_date .date");
        if (dateEl) {
            const text = dateEl.textContent.trim();
            if (text) return text;
        }

        const gridContainer = ns.getGridContainer();
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
    };

    ns.extractHeaderImage = function () {
        const img = document.querySelector(".game_header_image_full");
        if (img) return img.src || "";
        const fb = document.querySelector("img.game_header_image");
        if (fb) return fb.src || "";
        return "";
    };

    ns.extractName = function () {
        return ns.textOf(".apphub_AppName") ||
               (document.title || "").replace(/\s*on\s*Steam.*$/i, "").trim();
    };

    /**
     * Pick a primary genre from #genresAndManufacturer links, falling back to tags.
     * Skips "Free to Play" and other non-descriptive chips.
     */
    ns.extractGenre = function () {
        const genreLinks = document.querySelectorAll("#genresAndManufacturer a[href*='/genre/']");
        const skip = new Set(["free to play"]);
        for (const link of genreLinks) {
            const t = link.textContent.trim();
            if (t && !skip.has(t.toLowerCase())) return t;
        }
        const skipTags = new Set([
            "free to play", "indie", "casual", "early access",
            "multiplayer", "singleplayer", "co-op",
        ]);
        for (const tag of ns.getPopularTagEls()) {
            const t = tag.textContent.trim();
            if (t && !skipTags.has(t.toLowerCase())) return t;
        }
        return "";
    };
})();
