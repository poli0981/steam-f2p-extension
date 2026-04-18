// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Anti-cheat detection — two-pass strategy.
 *
 *   Pass 1: Steam's structured .anticheat_section (newer layout, preferred)
 *           → returns label + kernel/non-kernel classification
 *   Pass 2: Dictionary pattern scan across AC-adjacent DOM zones (fallback)
 *
 * 20 anti-cheat systems tracked.
 */

(function () {
    "use strict";
    const ns = globalThis.SF2P;

    ns.ANTI_CHEAT_DB = [
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

    /**
     * Map a raw AC name string to a short canonical label, or null if no match.
     */
    ns.lookupACLabel = function (rawName) {
        const lower = rawName.toLowerCase();
        for (const entry of ns.ANTI_CHEAT_DB) {
            for (const pat of entry.patterns) {
                if (lower.includes(pat)) return entry.label;
            }
        }
        return null;
    };

    /**
     * Detect anti-cheat system(s) on the page.
     *
     * @returns {{label: string, note: string, isKernel: boolean|null}}
     */
    ns.detectAntiCheat = function () {
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

                const shortLabel = ns.lookupACLabel(rawName) || rawName;
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
            ns.textsOf(".game_area_details_specs a").join(" "),
            ns.textOf(".DRM_notice, .drm_notice, .game_area_legal").toLowerCase(),
            ns.textOf("#game_area_legal, .eula_text").toLowerCase(),
            ns.textOf(".game_area_sys_req_leftCol, .game_area_sys_req_rightCol, .game_area_sys_req_full").toLowerCase(),
            ns.textOf(".game_area_description").toLowerCase(),
        ];
        const searchText = zones.join(" ");

        for (const ac of ns.ANTI_CHEAT_DB) {
            for (const pattern of ac.patterns) {
                if (searchText.includes(pattern)) {
                    return { label: ac.label, note: ac.label, isKernel: null };
                }
            }
        }

        return { label: "-", note: "", isKernel: null };
    };
})();
