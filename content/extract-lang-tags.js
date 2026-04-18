// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Languages table and user-defined popular tags.
 */

(function () {
    "use strict";
    const ns = globalThis.SF2P;

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
     * @returns {{list: string[], details: Array<{name: string, interface: boolean, audio: boolean, subtitles: boolean}>}}
     */
    ns.extractLanguages = function () {
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

            const entry = {
                name: langName,
                interface: ns.hasCheck(cells[1]),
                audio: ns.hasCheck(cells[2]),
                subtitles: ns.hasCheck(cells[3]),
            };

            // Defensive: skip rows with no support signal at all
            // (catches edge cases where Steam omits the "unsupported" class)
            if (!entry.interface && !entry.audio && !entry.subtitles) continue;

            list.push(langName);
            details.push(entry);
        }

        return { list, details };
    };

    /**
     * Extract all user-defined tags from the popular tags section.
     * Includes tags hidden via display:none (Steam hides overflow tags).
     * Uses the cached tag element collection from lib-dom.
     *
     * @returns {string[]} e.g. ["Action", "Puzzle", "2D", "Controller", "Pixel Graphics", ...]
     */
    ns.extractAllTags = function () {
        const tags = [];
        for (const el of ns.getPopularTagEls()) {
            const t = el.textContent.trim();
            if (t && t !== "+") tags.push(t);
        }
        return tags;
    };
})();
