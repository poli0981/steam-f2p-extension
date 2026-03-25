// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Queue page logic.
 * Renders game cards, handles search/filter, edit optional fields, remove entries.
 */

import {MSG, OPTIONAL_FIELDS} from "../shared/constants.js";
import {extractAppId, formatTime, truncate} from "../shared/utils.js";

// ── DOM refs ──
const $ = (s) => document.querySelector (s);
const queueCountEl = $ ("#queueCount");
const queueGrid = $ ("#queueGrid");
const emptyState = $ ("#emptyState");
const searchInput = $ ("#searchInput");
const refreshBtn = $ ("#refreshBtn");
const pushAllBtn = $ ("#pushAllBtn");
const clearAllBtn = $ ("#clearAllBtn");

let currentQueue = [];

// ── Helpers ──

function sendMessage (type, data = null) {
    return chrome.runtime.sendMessage ({type, data});
}

function showToast (text, type = "info") {
    const toast = document.createElement ("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    document.body.appendChild (toast);
    setTimeout (() => {
        toast.classList.add ("fade-out");
        setTimeout (() => toast.remove (), 300);
    }, 2500);
}

// ── Render ──

function renderQueue (queue, filter = "") {
    currentQueue = queue;
    queueCountEl.textContent = queue.length;
    pushAllBtn.disabled = queue.length === 0;
    clearAllBtn.disabled = queue.length === 0;

    let filtered = queue;
    if (filter) {
        const q = filter.toLowerCase ();
        filtered = queue.filter ((g) =>
                                     (
                                     g.name || ""
                                     ).toLowerCase ()
                                      .includes (q) ||
                                     (
                                     g.genre || ""
                                     ).toLowerCase ()
                                      .includes (q) ||
                                     (
                                     g.developer || ""
                                     ).toLowerCase ()
                                      .includes (q) ||
                                     (
                                     g.link || ""
                                     ).includes (q)
        );
    }

    if (filtered.length === 0) {
        queueGrid.innerHTML = "";
        queueGrid.style.display = "none";
        emptyState.style.display = "flex";
        if (filter && queue.length > 0) {
            emptyState.querySelector ("p").textContent = "No matches found";
            emptyState.querySelector (".text-sm").textContent = `${queue.length} game(s) in queue, but none match "${filter}".`;
        }
        else {
            emptyState.querySelector ("p").textContent = "Queue is empty";
            emptyState.querySelector (".text-sm").textContent = 'Browse Steam store pages and click "Add to Queue" to get started.';
        }
        return;
    }

    emptyState.style.display = "none";
    queueGrid.style.display = "grid";
    queueGrid.innerHTML = "";

    for (let i = 0; i < filtered.length; i++) {
        const card = createCard (filtered[i]);
        card.classList.add ("slide-in");
        card.style.animationDelay = `${Math.min (i * 40, 400)}ms`;
        queueGrid.appendChild (card);
    }
}

function createCard (game) {
    const appid = extractAppId (game.link) || "?";
    const card = document.createElement ("div");
    card.className = "game-card";
    card.dataset.appid = appid;

    // Header with thumbnail
    const header = document.createElement ("div");
    header.className = "game-card-header";

    const thumb = document.createElement ("img");
    thumb.className = "game-card-thumb";
    thumb.src = game.header_image || "";
    thumb.alt = game.name || "";
    thumb.loading = "lazy";
    thumb.onerror = () => { thumb.src = ""; };

    const removeBtn = document.createElement ("button");
    removeBtn.className = "game-card-remove";
    removeBtn.title = "Remove from queue";
    removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    removeBtn.addEventListener ("click", () => handleRemove (appid, game.name));

    header.append (thumb, removeBtn);

    // Body
    const body = document.createElement ("div");
    body.className = "game-card-body";

    const name = document.createElement ("div");
    name.className = "game-card-name truncate";
    name.textContent = game.name || `App ${appid}`;
    name.title = game.name || "";

    const meta = document.createElement ("div");
    meta.className = "game-card-meta";

    if (game.genre) {
        const genreTag = document.createElement ("span");
        genreTag.textContent = game.genre;
        meta.appendChild (genreTag);
    }
    if (game.developer) {
        const devTag = document.createElement ("span");
        devTag.textContent = truncate (game.developer, 20);
        meta.appendChild (devTag);
    }
    const addedTag = document.createElement ("span");
    addedTag.textContent = formatTime (game.added_at);
    addedTag.title = "Added at";
    meta.appendChild (addedTag);

    body.append (name, meta);

    // Toggle for optional fields
    const toggle = document.createElement ("button");
    toggle.className = "game-card-toggle";
    toggle.textContent = "▾ Edit optional fields";
    toggle.addEventListener ("click", () => {
        const fields = card.querySelector (".game-card-fields");
        const isOpen = fields.classList.toggle ("open");
        toggle.textContent = isOpen ? "▴ Hide fields" : "▾ Edit optional fields";
    });

    // Optional fields panel
    const fields = document.createElement ("div");
    fields.className = "game-card-fields";

    for (const [key, def] of Object.entries (OPTIONAL_FIELDS)) {
        const row = document.createElement ("div");
        row.className = "field-row";

        const label = document.createElement ("span");
        label.className = "field-label";
        label.textContent = def.label;

        const inputWrap = document.createElement ("div");
        inputWrap.className = "field-input";

        let input;
        if (def.type === "select") {
            input = document.createElement ("select");
            input.className = "select";
            for (const opt of def.options) {
                const option = document.createElement ("option");
                option.value = opt;
                option.textContent = opt;
                if (game[key] === opt) option.selected = true;
                input.appendChild (option);
            }
        }
        else {
            input = document.createElement ("input");
            input.type = "text";
            input.className = "input";
            input.placeholder = def.placeholder || "";
            input.value = game[key] || "";
        }

        input.dataset.field = key;
        input.addEventListener ("change", () => handleFieldUpdate (appid, key, input.value));

        inputWrap.appendChild (input);
        row.append (label, inputWrap);
        fields.appendChild (row);
    }

    card.append (header, body, toggle, fields);
    return card;
}

// ── Handlers ──

async function handleRemove (appid, name) {
    const resp = await sendMessage (MSG.REMOVE_FROM_QUEUE, {appid});
    if (resp?.ok) {
        showToast (`Removed: ${name || appid}`, "info");
        await loadQueue ();
    }
    else {
        showToast (resp?.error || "Failed to remove", "error");
    }
}

async function handleFieldUpdate (appid, field, value) {
    const resp = await sendMessage (MSG.UPDATE_ENTRY, {
        appid,
        fields: {[field]: value},
    });
    if (!resp?.ok) {
        showToast (resp?.error || "Failed to update", "error");
    }
}

async function loadQueue () {
    const resp = await sendMessage (MSG.GET_QUEUE);
    const queue = resp?.ok ? resp.data : [];
    const filter = searchInput.value.trim ();
    renderQueue (queue, filter);
}

// ── Events ──

searchInput.addEventListener ("input", () => {
    const filter = searchInput.value.trim ();
    renderQueue (currentQueue, filter);
});

refreshBtn.addEventListener ("click", async () => {
    refreshBtn.disabled = true;
    await loadQueue ();
    refreshBtn.disabled = false;
    showToast ("Queue refreshed", "info");
});

pushAllBtn.addEventListener ("click", async () => {
    if (currentQueue.length === 0) return;

    const count = currentQueue.length;
    if (!confirm (`Push ${count} game(s) to GitHub?
This will append to scripts/temp_info.jsonl.`)) return;

    pushAllBtn.disabled = true;
    pushAllBtn.innerHTML = `<span class="spinner"></span> Pushing...`;

    const resp = await sendMessage (MSG.PUSH_QUEUE);

    if (resp?.ok) {
        const label = resp.signed ? " (GPG signed)" : "";
        showToast (`Pushed ${resp.pushed} game(s)${label}`, "success");
        await loadQueue ();
    }
    else if (resp?.gpgFailed) {
        const fallback = confirm (`GPG signing failed: ${resp.error}

Push unsigned instead?`);
        if (fallback) {
            pushAllBtn.innerHTML = `<span class="spinner"></span> Unsigned...`;
            const unsignedResp = await sendMessage (MSG.PUSH_QUEUE_UNSIGNED);
            if (unsignedResp?.ok) {
                showToast (`Pushed ${unsignedResp.pushed} game(s) (unsigned)`, "success");
                await loadQueue ();
            }
            else {
                showToast (unsignedResp?.error || "Unsigned push failed", "error");
            }
        }
    }
    else {
        showToast (resp?.error || "Push failed", "error");
    }

    pushAllBtn.disabled = false;
    pushAllBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> Push All`;
});

// ── Clear All ──

clearAllBtn.addEventListener ("click", async () => {
    if (currentQueue.length === 0) return;
    if (!confirm (`Remove all ${currentQueue.length} game(s) from queue?
This cannot be undone.`)) return;

    clearAllBtn.disabled = true;
    clearAllBtn.textContent = "Clearing...";

    // Remove each entry
    for (const game of currentQueue) {
        const appid = extractAppId (game.link);
        if (appid) {
            await sendMessage (MSG.REMOVE_FROM_QUEUE, {appid});
        }
    }

    showToast (`Cleared ${currentQueue.length} game(s) from queue`, "info");
    await loadQueue ();

    clearAllBtn.disabled = false;
    clearAllBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Clear`;
});

// ── Keyboard shortcuts ──

document.addEventListener ("keydown", (e) => {
    // Ctrl+F or / → focus search
    if ((
            e.ctrlKey && e.key === "f"
        ) || (
            e.key === "/" && document.activeElement !== searchInput
        )) {
        e.preventDefault ();
        searchInput.focus ();
    }
    // Escape → clear search
    if (e.key === "Escape" && document.activeElement === searchInput) {
        searchInput.value = "";
        renderQueue (currentQueue, "");
        searchInput.blur ();
    }
});

// ── Init ──
document.addEventListener ("DOMContentLoaded", loadQueue);
