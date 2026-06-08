// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Content script — Steam store SEARCH-page detector (v2.5.0).
 *
 * Runs on store.steampowered.com/search* pages. Unlike the app-page
 * detector (content/detector.js), a search results page lists many games
 * at once, so this script works per-row on hover via event delegation —
 * letting the user triage and queue free games without opening each
 * app page.
 *
 * On hover over a `.search_result_row` it:
 *   1. Reads the row's appid / name / price signal straight from the DOM.
 *   2. For a free row, asks the service worker whether the appid is already
 *      tracked (MSG.CHECK_DUPLICATE — local queue + remote master DB).
 *   3. Shows a small Shadow-DOM tooltip with the status, plus an "Add"
 *      button for free, untracked games.
 *   4. Adds via the shared AUTO_ADD_FROM_PAGE flow (source "search") on
 *      either an explicit Add click or, if enabled, a sustained hover.
 *
 * Gated by the opt-in `search_detect` setting. `search_autoadd_on_hover`
 * switches between explicit-Add and add-on-hover. Searches filtered to
 * non-game categories (DLC / soundtrack / playtest / video / mod / demo)
 * are skipped entirely.
 *
 * Content scripts load as IIFEs sharing globalThis.SF2P — no ES imports.
 * Message-type strings are hard-coded to match shared/constants.js MSG.
 */

(function () {
    "use strict";

    const SF2P = globalThis.SF2P;
    if (!SF2P) {
        console.error("[SF2P] search-detector: namespace missing — manifest content-script order is wrong");
        return;
    }

    // category1 values that mean "this search is not listing base games".
    // Source: searchdetect.html — DLC(21), soundtrack(990), playtest(989),
    // video(992), mod(997), demo(10). Mixed searches join them with commas
    // (URL-encoded %2C). The `ndl` param does not affect results.
    const NON_GAME_CATEGORIES = new Set(["10", "21", "989", "990", "992", "997"]);

    const HOVER_DELAY_MS = 220;   // sustained-hover threshold before acting
    const HIDE_DELAY_MS = 180;    // grace period before hiding the tooltip

    // ── Localized tooltip text (EN + VI) ──
    // The service worker owns the toast catalog (shared/notification-text.js),
    // but content scripts can't import it, and these strings render on every
    // hover — too hot to round-trip. Keep a small local copy here.
    const TIP = {
        en: {
            checking: "Checking…",
            free: "Free — not tracked yet",
            inQueue: "Already in your queue",
            inMaster: "Already in the tracker database",
            paid: "Not a free game",
            upcoming: "Not yet released",
            add: "Add to queue",
            adding: "Adding…",
            added: "Added to queue",
            skip: "Wrong category — search detection skipped",
        },
        vi: {
            checking: "Đang kiểm tra…",
            free: "Miễn phí — chưa được theo dõi",
            inQueue: "Đã có trong hàng đợi",
            inMaster: "Đã có trong cơ sở dữ liệu",
            paid: "Không phải game miễn phí",
            upcoming: "Chưa phát hành",
            add: "Thêm vào hàng đợi",
            adding: "Đang thêm…",
            added: "Đã thêm vào hàng đợi",
            skip: "Không đúng thể loại — bỏ qua tự động detect",
        },
    };

    let settings = { search_detect: false, search_autoadd_on_hover: false, notify_lang: "auto" };

    function lang() {
        const s = settings.notify_lang;
        if (s === "en" || s === "vi") return s;
        const nav = (navigator.language || "").toLowerCase();
        return nav.startsWith("vi") ? "vi" : "en";
    }
    function t() { return TIP[lang()] || TIP.en; }

    // ── Messaging helper (promisified, never rejects) ──
    function send(type, data) {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage({ type, data }, (resp) => {
                    if (chrome.runtime.lastError) { resolve(null); return; }
                    resolve(resp);
                });
            } catch {
                resolve(null); // sw restarting
            }
        });
    }

    // ── Whether this search URL lists non-game content ──
    function searchIsNonGame() {
        const cat = new URLSearchParams(location.search).get("category1");
        if (!cat) return false;
        return cat.split(",").some((c) => NON_GAME_CATEGORIES.has(c.trim()));
    }
    const nonGame = searchIsNonGame();

    function enabled() {
        return !!settings.search_detect && !nonGame;
    }

    // ── Row parsing ──
    // Returns null for rows without a single appid (bundles / packages carry
    // data-ds-bundleid / data-ds-packageid instead).
    function parseRow(row) {
        const appid = row.getAttribute("data-ds-appid");
        if (!appid || /\D/.test(appid)) return null;

        const name = (row.querySelector(".title")?.textContent || "").trim();
        const capsule = row.querySelector(".search_capsule img")?.getAttribute("src") || "";
        const release_date = (row.querySelector(".search_released")?.textContent || "").trim();

        const platforms = [];
        const plats = row.querySelector(".search_platforms");
        if (plats) {
            if (plats.querySelector(".platform_img.win")) platforms.push("Windows");
            if (plats.querySelector(".platform_img.mac")) platforms.push("macOS");
            if (plats.querySelector(".platform_img.linux")) platforms.push("Linux");
        }

        // Price signal: an explicit ".discount_final_price.free" ("Free") marks
        // a free game (incl. F2P). A non-zero data-price-final with a price
        // element is paid. Everything else (empty discount block, no price) is
        // treated as upcoming / unknown and skipped.
        let status;
        if (row.querySelector(".discount_final_price.free")) {
            status = "free";
        } else {
            const priceWrap = row.querySelector(".search_price_discount_combined");
            const finalPrice = priceWrap ? priceWrap.getAttribute("data-price-final") : null;
            const hasPriceEl = !!row.querySelector(".discount_final_price");
            status = (hasPriceEl && finalPrice && finalPrice !== "0") ? "paid" : "upcoming";
        }

        return {
            appid,
            name,
            link: `https://store.steampowered.com/app/${appid}/`,
            header_image: capsule,
            platforms,
            release_date,
            status,
        };
    }

    // ── Tooltip (isolated Shadow DOM, positioned per-row) ──
    const TIP_CSS = `
:host { all: initial; position: fixed; z-index: 2147483646; pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
.tip { pointer-events: auto; display: inline-flex; align-items: center; gap: 8px;
       max-width: 320px; padding: 8px 12px; border-radius: 8px; font-size: 12px;
       line-height: 1.4; font-weight: 500; color: #0F1724; background: #66C0F4;
       box-shadow: 0 10px 30px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.2);
       border: 1px solid rgba(255,255,255,0.18); }
.tip.success { background: #34D399; }
.tip.muted   { background: #C7D5E0; color: #1B2838; }
.tip .label  { white-space: normal; overflow-wrap: anywhere; }
.tip button  { pointer-events: auto; cursor: pointer; border: 0; border-radius: 6px;
               padding: 4px 10px; font-size: 12px; font-weight: 700; color: #0F1724;
               background: #FFFFFF; white-space: nowrap; }
.tip button:hover    { opacity: 0.85; }
.tip button:disabled { opacity: 0.6; cursor: default; }
`;

    let tipHost = null;
    let tipRoot = null;
    let tipBox = null;
    let hideTimer = null;

    function ensureTip() {
        if (tipHost) return;
        tipHost = document.createElement("div");
        tipHost.id = "sf2p-search-tip-host";
        document.documentElement.appendChild(tipHost);
        tipRoot = tipHost.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = TIP_CSS;
        tipRoot.appendChild(style);
        tipBox = document.createElement("div");
        tipBox.className = "tip";
        tipRoot.appendChild(tipBox);
        // Keep the tooltip open while the pointer is over it (so the Add
        // button is reachable across the row→tooltip gap).
        tipHost.addEventListener("mouseenter", () => clearTimeout(hideTimer));
        tipHost.addEventListener("mouseleave", () => scheduleHide());
    }

    function positionTip(row) {
        const r = row.getBoundingClientRect();
        // Anchor just below the row's left edge, clamped into the viewport.
        const left = Math.max(8, Math.min(r.left + 12, window.innerWidth - 340));
        const top = Math.min(r.bottom - 6, window.innerHeight - 48);
        tipHost.style.left = `${Math.round(left)}px`;
        tipHost.style.top = `${Math.round(top)}px`;
    }

    function showTip(row, render) {
        ensureTip();
        clearTimeout(hideTimer);
        positionTip(row);
        tipBox.className = "tip";
        tipBox.textContent = "";
        render(tipBox);
        tipHost.style.display = "block";
    }

    function hideTip() {
        if (tipHost) tipHost.style.display = "none";
    }

    function scheduleHide() {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hideTip, HIDE_DELAY_MS);
    }

    function labelOnly(box, text, variant) {
        if (variant) box.classList.add(variant);
        const span = document.createElement("span");
        span.className = "label";
        span.textContent = text;
        box.appendChild(span);
    }

    // ── Add flow (shared AUTO_ADD_FROM_PAGE handler, source "search") ──
    // dedup cache keyed by appid for the page session.
    const dupCache = new Map(); // appid -> {isDuplicate, source}

    async function doAdd(data, trigger, box) {
        const tt = t();
        // Optimistic "Adding…" state.
        box.className = "tip";
        box.textContent = "";
        labelOnly(box, tt.adding);

        const resp = await send("AUTO_ADD_FROM_PAGE", {
            source: "search",
            trigger,
            gameData: {
                link: data.link,
                appid: data.appid,
                name: data.name,
                header_image: data.header_image,
                platforms: data.platforms,
                release_date: data.release_date,
            },
            classification: { free_type: "free_game" },
        });

        if (resp && resp.action === "added") {
            dupCache.set(data.appid, { isDuplicate: true, source: "queue" });
            box.className = "tip success";
            box.textContent = "";
            labelOnly(box, tt.added);
        } else if (resp && (resp.action === "duplicate" || resp.action === "master_duplicate")) {
            dupCache.set(data.appid, {
                isDuplicate: true,
                source: resp.action === "master_duplicate" ? "remote" : "queue",
            });
            box.className = "tip";
            box.textContent = "";
            labelOnly(box, resp.action === "master_duplicate" ? tt.inMaster : tt.inQueue);
        }
        // The service worker already emits a localized in-page toast for
        // every non-silent outcome (added / queue full / duplicate …), so
        // we don't double-report here.
    }

    // ── Hover handling ──
    let currentRow = null;
    let hoverTimer = null;

    async function handleRow(row) {
        const data = parseRow(row);
        if (!data) { hideTip(); return; }
        const tt = t();

        if (data.status === "paid") {
            showTip(row, (box) => labelOnly(box, tt.paid, "muted"));
            return;
        }
        if (data.status === "upcoming") {
            showTip(row, (box) => labelOnly(box, tt.upcoming, "muted"));
            return;
        }

        // Free: resolve tracked status (cached per appid).
        let dup = dupCache.get(data.appid);
        if (!dup) {
            showTip(row, (box) => labelOnly(box, tt.checking));
            const resp = await send("CHECK_DUPLICATE", { appid: data.appid });
            dup = (resp && resp.ok && resp.data) ? resp.data : { isDuplicate: false, source: null };
            dupCache.set(data.appid, dup);
            // The pointer may have moved on while we awaited.
            if (currentRow !== row) return;
        }

        if (dup.isDuplicate && dup.source === "remote") {
            showTip(row, (box) => labelOnly(box, tt.inMaster));
            return;
        }
        if (dup.isDuplicate) {
            showTip(row, (box) => labelOnly(box, tt.inQueue));
            return;
        }

        // Free + untracked.
        if (settings.search_autoadd_on_hover) {
            showTip(row, (box) => labelOnly(box, tt.adding));
            doAdd(data, "hover", tipBox);
            return;
        }
        showTip(row, (box) => {
            labelOnly(box, tt.free);
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = tt.add;
            btn.addEventListener("click", () => {
                btn.disabled = true;
                doAdd(data, "click", tipBox);
            });
            box.appendChild(btn);
        });
    }

    function onRowEnter(row) {
        currentRow = row;
        clearTimeout(hideTimer);
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => handleRow(row), HOVER_DELAY_MS);
    }

    function onRowLeave() {
        currentRow = null;
        clearTimeout(hoverTimer);
        scheduleHide();
    }

    // Delegated on document so dynamically-loaded rows (Steam's infinite
    // scroll / filter re-renders) are covered without re-binding.
    document.addEventListener("mouseover", (e) => {
        if (!enabled()) return;
        const tgt = e.target;
        // Pointer is over our own tooltip (Shadow host) — keep it open.
        if (tipHost && tgt === tipHost) { clearTimeout(hideTimer); return; }
        const row = tgt && tgt.closest ? tgt.closest(".search_result_row") : null;
        if (row === currentRow) return;
        if (row) onRowEnter(row);
        else onRowLeave();
    });

    // ── Settings load + live updates ──
    async function loadSettingsSafe() {
        const resp = await send("GET_SETTINGS");
        return (resp && resp.ok && resp.data) ? resp.data : settings;
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.settings && changes.settings.newValue) {
            settings = changes.settings.newValue;
        }
    });

    (async function init() {
        settings = await loadSettingsSafe();
        if (settings.search_detect && nonGame && typeof SF2P.showInPageToast === "function") {
            SF2P.showInPageToast(t().skip, "info");
        }
    })();
})();
