// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Popup logic – Phase 4 polished.
 * First-run detection, duplicate source display, section animations,
 * improved push flow with GPG fallback, connection status.
 */

import {MSG, QUEUE_MAX} from "../shared/constants.js";
import {truncate} from "../shared/utils.js";

const $ = (s) => document.querySelector (s);

const versionEl = $ ("#version");
const statusDot = $ ("#statusDot");
const detectedLoading = $ ("#detectedLoading");
const detectedContent = $ ("#detectedContent");
const detectedNone = $ ("#detectedNone");
const detectedDuplicate = $ ("#detectedDuplicate");
const detectedThumb = $ ("#detectedThumb");
const detectedName = $ ("#detectedName");
const detectedGenre = $ ("#detectedGenre");
const detectedDev = $ ("#detectedDev");
const detectedBadges = $ ("#detectedBadges");
const addBtn = $ ("#addBtn");
const queueCount = $ ("#queueCount");
const queueBar = $ ("#queueBar");
const pushBtn = $ ("#pushBtn");
const openQueueBtn = $ ("#openQueueBtn");
const openSettingsBtn = $ ("#openSettingsBtn");
const activityList = $ ("#activityList");

// ── Helpers ──

function sendMessage (type, data = null) {
    return chrome.runtime.sendMessage ({type, data});
}

function showToast (text, type = "info") {
    // Remove existing toasts
    document.querySelectorAll (".toast")
            .forEach ((t) => t.remove ());
    const toast = document.createElement ("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    document.body.appendChild (toast);
    setTimeout (() => {
        toast.classList.add ("fade-out");
        setTimeout (() => toast.remove (), 300);
    }, 2800);
}

// ── Init ──

async function init () {
    const manifest = chrome.runtime.getManifest ();
    versionEl.textContent = `v${manifest.version}`;

    const settings = await checkConnection ();
    await checkFirstRun (settings);
    await loadDetectedGame ();
    await loadQueueStatus ();
    await loadActivity ();
    bindEvents ();

    // Animate sections in sequence
    document.querySelectorAll (".popup-section")
            .forEach ((el, i) => {
                el.style.opacity = "0";
                setTimeout (() => {
                    el.classList.add ("fade-in");
                    el.style.opacity = "";
                }, i * 60);
            });
}

async function checkConnection () {
    const resp = await sendMessage (MSG.GET_SETTINGS);
    const s = resp?.ok ? resp.data : {};
    const connected = !!(
        s.github_owner && s.github_repo && s.github_token
    );
    statusDot.className = `status-dot ${connected ? "online" : "offline"}`;
    statusDot.title = connected
                      ? `Connected: ${s.github_owner}/${s.github_repo}`
                      : "GitHub not configured — click Settings";
    return s;
}

async function checkFirstRun (settings) {
    if (settings.github_owner && settings.github_repo && settings.github_token) return;

    // Show first-run banner
    const section = $ ("#detectedSection");
    const banner = document.createElement ("div");
    banner.className = "first-run-banner";
    banner.innerHTML = `
    <p><strong>Welcome!</strong> Configure your GitHub connection to start tracking games.</p>
    <button class="btn btn-primary btn-sm" id="firstRunSetupBtn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
      Open Settings
    </button>
  `;
    section.insertBefore (banner, section.firstChild.nextSibling);
    banner.querySelector ("#firstRunSetupBtn")
          .addEventListener ("click", () => {
              chrome.tabs.create ({url: chrome.runtime.getURL ("settings/settings.html")});
              window.close ();
          });
}

async function loadDetectedGame () {
    try {
        const [tab] = await chrome.tabs.query ({active: true, currentWindow: true});
        if (!tab || !tab.url || !tab.url.includes ("store.steampowered.com/app/")) {
            showNoGame ();
            return;
        }

        const resp = await sendMessage ("GET_DETECTED_GAME", {tabId: tab.id});

        if (resp?.ok && resp.data) {
            const game = resp.data;
            const dupResp = await sendMessage (MSG.CHECK_DUPLICATE, {appid: game.appid});
            const dupData = dupResp?.ok ? dupResp.data : {};
            showDetectedGame (game, dupData);
        }
        else {
            // Content script may not have fired yet — retry once briefly
            setTimeout (async () => {
                if (detectedLoading.style.display === "none") return;
                const retry = await sendMessage ("GET_DETECTED_GAME", {tabId: tab.id});
                if (retry?.ok && retry.data) {
                    const dupResp2 = await sendMessage (MSG.CHECK_DUPLICATE, {appid: retry.data.appid});
                    showDetectedGame (retry.data, dupResp2?.ok ? dupResp2.data : {});
                }
                else {
                    showNoGame ();
                }
            }, 1200);
        }
    }
    catch {
        showNoGame ();
    }
}

function showDetectedGame (game, dupData = {}) {
    detectedLoading.style.display = "none";
    detectedNone.style.display = "none";
    detectedContent.style.display = "block";

    detectedThumb.src = game.header_image || "";
    detectedThumb.alt = game.name || "";
    detectedName.textContent = truncate (game.name, 45) || `App ${game.appid}`;
    detectedGenre.textContent = game.genre || "Unknown";
    detectedDev.textContent = truncate (game.developer, 25) || "Unknown";

    // Badges
    detectedBadges.innerHTML = "";

    // ── Blocked types: DLC, Demo, Playtest, Paid ──

    // DLC page
    if (game.is_dlc) {
        appendBadge (detectedBadges, "DLC (ignored)", "warning");
        addBtn.disabled = true;
        addBtn.textContent = "DLC — Not a base game";
        detectedDuplicate.style.display = "none";
        return;
    }

    // Demo
    if (game.free_type === "demo" || game.is_demo) {
        appendBadge (detectedBadges, "Demo", "warning");
        addBtn.disabled = true;
        addBtn.textContent = "Demo — Ignored";
        detectedDuplicate.style.display = "none";
        return;
    }

    // Playtest
    if (game.free_type === "playtest" || game.is_playtest) {
        appendBadge (detectedBadges, "Playtest", "warning");
        addBtn.disabled = true;
        addBtn.textContent = "Playtest — Ignored";
        detectedDuplicate.style.display = "none";
        return;
    }

    // Paid game
    if (game.is_free === false) {
        appendBadge (detectedBadges, game.price ? `Paid (${game.price})` : "Paid", "error");
        addBtn.disabled = true;
        addBtn.textContent = "Not Free — Ignored";
        detectedDuplicate.style.display = "none";
        return;
    }

    // ── Free game types ──

    if (game.free_type === "f2p") {
        appendBadge (detectedBadges, "Free to Play", "success");
    }
    else if (game.free_type === "free_game") {
        appendBadge (detectedBadges, "Free Game", "success");
    }
    else if (game.is_free === true) {
        appendBadge (detectedBadges, "Free", "success");
    }

    // Paid DLC info
    if (game.has_paid_dlc) {
        appendBadge (detectedBadges, "Has paid DLC", "info");
    }

    // Online / Offline
    if (game.type_game === "online") {
        appendBadge (detectedBadges, "Online", "info");
        if (game.anti_cheat && game.anti_cheat !== "-") {
            // Kernel-level AC gets red/error badge, non-kernel gets warning
            const acBadgeType = game.is_kernel_ac === true ? "error" : "warning";
            const kernelSuffix = game.is_kernel_ac === true ? " ⚠ Kernel"
                                                            : game.is_kernel_ac === false ? "" : "";
            appendBadge (detectedBadges, game.anti_cheat + kernelSuffix, acBadgeType);
        }
    }

    // ── Duplicate status ──

    const isDuplicate = dupData.isDuplicate;
    if (isDuplicate) {
        detectedDuplicate.style.display = "block";
        const sourceLabel = dupData.source === "remote" ? "already in tracker" : "already in queue";
        detectedDuplicate.textContent = "";
        const dupSpan = document.createElement ("span");
        dupSpan.className = "text-sm";
        dupSpan.style.color = "var(--accent-yellow)";
        dupSpan.textContent = `⚠ Duplicate — ${sourceLabel}`;
        detectedDuplicate.appendChild (dupSpan);
        addBtn.disabled = true;
        addBtn.textContent = "Already Tracked";
    }
    else {
        detectedDuplicate.style.display = "none";
        addBtn.disabled = false;
        addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add to Queue`;

        if (dupData.warning) {
            appendBadge (detectedBadges, "Local check only", "warning");
        }
    }
}

function appendBadge (container, text, type) {
    const badge = document.createElement ("span");
    badge.className = `badge badge-${type}`;
    badge.textContent = text;
    container.appendChild (badge);
}

function showNoGame () {
    detectedLoading.style.display = "none";
    detectedContent.style.display = "none";
    detectedDuplicate.style.display = "none";
    detectedNone.style.display = "block";
}

async function loadQueueStatus () {
    const resp = await sendMessage (MSG.GET_QUEUE_SIZE);
    const size = resp?.ok ? resp.data : 0;
    updateQueueUI (size);
}

function updateQueueUI (size) {
    queueCount.textContent = size;
    const pct = (
                    size / QUEUE_MAX
                ) * 100;
    queueBar.style.width = `${pct}%`;
    queueBar.className = "queue-bar-fill" +
                         (
                             pct >= 100 ? " full" : pct >= 80 ? " warning" : ""
                         );
    pushBtn.disabled = size === 0;
}

async function loadActivity () {
    const resp = await sendMessage (MSG.GET_LOGS);
    if (!resp?.ok || !resp.data?.length) return;

    const recent = resp.data.slice (-5)
                       .reverse ();
    activityList.innerHTML = "";

    for (const entry of recent) {
        const item = document.createElement ("div");
        item.className = "activity-item";

        const dot = document.createElement ("span");
        dot.className = `activity-dot ${entry.level}`;

        const text = document.createElement ("span");
        text.className = "activity-text truncate";
        text.textContent = entry.message;

        const time = document.createElement ("span");
        time.className = "activity-time";
        const d = new Date (entry.timestamp);
        time.textContent = `${d.getHours ()
                               .toString ()
                               .padStart (2, "0")}:${d.getMinutes ()
                                                      .toString ()
                                                      .padStart (2, "0")}`;

        item.append (dot, text, time);
        activityList.appendChild (item);
    }
}

// ── Events ──

function bindEvents () {
    addBtn.addEventListener ("click", async () => {
        const [tab] = await chrome.tabs.query ({active: true, currentWindow: true});
        if (!tab) return;

        const resp = await sendMessage ("GET_DETECTED_GAME", {tabId: tab.id});
        if (!resp?.ok || !resp.data) {
            showToast ("No game detected on this page", "warning");
            return;
        }

        addBtn.disabled = true;
        addBtn.innerHTML = `<span class="spinner"></span> Adding...`;

        const addResp = await sendMessage (MSG.ADD_TO_QUEUE, resp.data);

        if (addResp?.ok) {
            addBtn.innerHTML = `✓ Added`;
            addBtn.classList.remove ("btn-success");
            addBtn.classList.add ("btn-ghost");
            updateQueueUI (addResp.data.queueSize);
            showToast (`Added: ${resp.data.name || "Game"}`, "success");
            await loadActivity ();
        }
        else {
            addBtn.disabled = false;
            addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add to Queue`;
            showToast (addResp?.error || "Failed to add", "error");
        }
    });

    pushBtn.addEventListener ("click", async () => {
        pushBtn.disabled = true;
        const origText = pushBtn.innerHTML;
        pushBtn.innerHTML = `<span class="spinner"></span> Pushing...`;

        const resp = await sendMessage (MSG.PUSH_QUEUE);

        if (resp?.ok) {
            const label = resp.signed ? " (signed)" : "";
            showToast (`Pushed ${resp.pushed} game(s)${label}`, "success");
            updateQueueUI (resp.remaining || 0);
            await loadActivity ();
        }
        else if (resp?.gpgFailed) {
            const fallback = confirm (`GPG signing failed: ${resp.error}

Push unsigned instead?`);
            if (fallback) {
                pushBtn.innerHTML = `<span class="spinner"></span> Unsigned...`;
                const unsignedResp = await sendMessage (MSG.PUSH_QUEUE_UNSIGNED);
                if (unsignedResp?.ok) {
                    showToast (`Pushed ${unsignedResp.pushed} game(s) (unsigned)`, "success");
                    updateQueueUI (unsignedResp.remaining || 0);
                    await loadActivity ();
                }
                else {
                    showToast (unsignedResp?.error || "Push failed", "error");
                }
            }
        }
        else {
            showToast (resp?.error || "Push failed", "error");
        }

        pushBtn.innerHTML = origText;
        pushBtn.disabled = false;
        await loadQueueStatus ();
    });

    openQueueBtn.addEventListener ("click", () => {
        chrome.tabs.create ({url: chrome.runtime.getURL ("queue/queue.html")});
        window.close ();
    });

    openSettingsBtn.addEventListener ("click", () => {
        chrome.tabs.create ({url: chrome.runtime.getURL ("settings/settings.html")});
        window.close ();
    });
}

document.addEventListener ("DOMContentLoaded", init);
