// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of Steam F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Queue page logic.
 * Renders game cards with:
 *   - Auto-detected fields (read-only, collapsible)
 *   - Editable fields (genre tag-select, type, anti-cheat, notes, safe)
 *   - Search, remove, push
 */

import { MSG, EDITABLE_FIELDS, AUTO_FIELDS, GENRE_PRESETS } from "../shared/constants.js";
import { extractAppId, formatTime, truncate } from "../shared/utils.js";

// ── DOM refs ──
const $ = (s) => document.querySelector(s);
const queueCountEl = $("#queueCount");
const queueGrid = $("#queueGrid");
const emptyState = $("#emptyState");
const searchInput = $("#searchInput");
const refreshBtn = $("#refreshBtn");
const pushAllBtn = $("#pushAllBtn");
const clearAllBtn = $("#clearAllBtn");

let currentQueue = [];

// ── Helpers ──

function sendMessage(type, data = null) {
    return chrome.runtime.sendMessage({ type, data });
}

function showToast(text, type = "info") {
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ── Render ──

function renderQueue(queue, filter = "") {
    currentQueue = queue;
    queueCountEl.textContent = queue.length;
    pushAllBtn.disabled = queue.length === 0;
    clearAllBtn.disabled = queue.length === 0;

    let filtered = queue;
    if (filter) {
        const q = filter.toLowerCase();
        filtered = queue.filter((g) => {
            const devStr = Array.isArray(g.developer) ? g.developer.join(", ") : (g.developer || "");
            const pubStr = Array.isArray(g.publisher) ? g.publisher.join(", ") : (g.publisher || "");
            return (g.name || "").toLowerCase().includes(q) ||
                   (g.genre || "").toLowerCase().includes(q) ||
                   devStr.toLowerCase().includes(q) ||
                   pubStr.toLowerCase().includes(q) ||
                   (g.link || "").includes(q) ||
                   (g.tags || []).some((t) => t.toLowerCase().includes(q));
        });
    }

    if (filtered.length === 0) {
        queueGrid.innerHTML = "";
        queueGrid.style.display = "none";
        emptyState.style.display = "flex";
        if (filter && queue.length > 0) {
            emptyState.querySelector("p").textContent = "No matches found";
            emptyState.querySelector(".text-sm").textContent =
                `${queue.length} game(s) in queue, but none match "${filter}".`;
        } else {
            emptyState.querySelector("p").textContent = "Queue is empty";
            emptyState.querySelector(".text-sm").textContent =
                'Browse Steam store pages and click "Add to Queue" to get started.';
        }
        return;
    }

    emptyState.style.display = "none";
    queueGrid.style.display = "grid";
    queueGrid.innerHTML = "";

    for (let i = 0; i < filtered.length; i++) {
        const card = createCard(filtered[i]);
        card.classList.add("slide-in");
        card.style.animationDelay = `${Math.min(i * 40, 400)}ms`;
        queueGrid.appendChild(card);
    }
}

function createCard(game) {
    const appid = extractAppId(game.link) || "?";
    const card = document.createElement("div");
    card.className = "game-card";
    card.dataset.appid = appid;

    // ── Header with thumbnail ──
    const header = document.createElement("div");
    header.className = "game-card-header";

    const thumb = document.createElement("img");
    thumb.className = "game-card-thumb";
    thumb.src = game.header_image || "";
    thumb.alt = game.name || "";
    thumb.loading = "lazy";
    thumb.onerror = () => { thumb.src = ""; };

    const removeBtn = document.createElement("button");
    removeBtn.className = "game-card-remove";
    removeBtn.title = "Remove from queue";
    removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    removeBtn.addEventListener("click", () => handleRemove(appid, game.name));

    header.append(thumb, removeBtn);

    // ── Body: name + quick meta badges ──
    const body = document.createElement("div");
    body.className = "game-card-body";

    const nameEl = document.createElement("div");
    nameEl.className = "game-card-name truncate";
    nameEl.textContent = game.name || `App ${appid}`;
    nameEl.title = game.name || "";

    const meta = document.createElement("div");
    meta.className = "game-card-meta";

    if (game.genre) {
        meta.appendChild(makeMetaTag(game.genre, ""));
    }
    // Developer: array or string
    const devStr = Array.isArray(game.developer)
                   ? game.developer.join(", ")
                   : (game.developer || "");
    if (devStr) {
        meta.appendChild(makeMetaTag(truncate(devStr, 25), ""));
    }
    if (game.platforms && game.platforms.length > 0) {
        meta.appendChild(makeMetaTag(game.platforms.join(" · "), ""));
    }
    meta.appendChild(makeMetaTag(formatTime(game.added_at), ""));

    body.append(nameEl, meta);

    // ── Auto-detected info (collapsible, read-only) ──
    const autoToggle = document.createElement("button");
    autoToggle.className = "game-card-toggle auto-toggle";
    autoToggle.textContent = "▾ Game Info (auto-detected)";
    autoToggle.addEventListener("click", () => {
        const panel = card.querySelector(".game-card-auto");
        const isOpen = panel.classList.toggle("open");
        autoToggle.textContent = isOpen
                                 ? "▴ Hide Game Info"
                                 : "▾ Game Info (auto-detected)";
    });

    const autoPanel = document.createElement("div");
    autoPanel.className = "game-card-auto";

    // Description
    if (game.description) {
        autoPanel.appendChild(makeAutoRow("Description", truncate(game.description, 200), game.description));
    }

    // Release date
    if (game.release_date) {
        autoPanel.appendChild(makeAutoRow("Release Date", game.release_date));
    }

    // Developer & Publisher (arrays)
    if (devStr) {
        autoPanel.appendChild(makeAutoRow("Developer", devStr));
    }
    const pubStr = Array.isArray(game.publisher)
                   ? game.publisher.join(", ")
                   : (game.publisher || "");
    if (pubStr && pubStr !== devStr) {
        autoPanel.appendChild(makeAutoRow("Publisher", pubStr));
    }

    // Platforms
    if (game.platforms && game.platforms.length > 0) {
        autoPanel.appendChild(makeAutoRow("Platforms", game.platforms.join(", ")));
    }

    // Languages
    if (game.languages && game.languages.length > 0) {
        const langText = game.languages.length <= 5
                         ? game.languages.join(", ")
                         : `${game.languages.slice(0, 5).join(", ")} +${game.languages.length - 5} more`;
        autoPanel.appendChild(makeAutoRow("Languages", langText,
                                          game.languages.join(", ")));
    }

    // Tags
    if (game.tags && game.tags.length > 0) {
        const tagRow = document.createElement("div");
        tagRow.className = "auto-row";

        const tagLabel = document.createElement("span");
        tagLabel.className = "auto-label";
        tagLabel.textContent = "Tags";

        const tagList = document.createElement("div");
        tagList.className = "auto-tags";
        for (const t of game.tags) {
            const chip = document.createElement("span");
            chip.className = "tag-chip";
            chip.textContent = t;
            tagList.appendChild(chip);
        }

        tagRow.append(tagLabel, tagList);
        autoPanel.appendChild(tagRow);
    }

    // ── Editable fields (collapsible) ──
    const editToggle = document.createElement("button");
    editToggle.className = "game-card-toggle edit-toggle";
    editToggle.textContent = "▾ Edit fields";
    editToggle.addEventListener("click", () => {
        const panel = card.querySelector(".game-card-fields");
        const isOpen = panel.classList.toggle("open");
        editToggle.textContent = isOpen ? "▴ Hide fields" : "▾ Edit fields";
    });

    const fieldsPanel = document.createElement("div");
    fieldsPanel.className = "game-card-fields";

    // Genre: tag-select dropdown
    fieldsPanel.appendChild(createGenreField(game, appid));

    // Other editable fields
    for (const [key, def] of Object.entries(EDITABLE_FIELDS)) {
        if (key === "genre") continue; // handled above

        const row = document.createElement("div");
        row.className = "field-row";

        const label = document.createElement("span");
        label.className = "field-label";
        label.textContent = def.label;

        const inputWrap = document.createElement("div");
        inputWrap.className = "field-input";

        let input;
        if (def.type === "select") {
            input = document.createElement("select");
            input.className = "select";
            for (const opt of def.options) {
                const option = document.createElement("option");
                option.value = opt;
                option.textContent = opt;
                if (game[key] === opt) option.selected = true;
                input.appendChild(option);
            }
        } else {
            input = document.createElement("input");
            input.type = "text";
            input.className = "input";
            input.placeholder = def.placeholder || "";
            input.value = game[key] || "";
        }

        input.dataset.field = key;
        input.addEventListener("change", () => handleFieldUpdate(appid, key, input.value));

        inputWrap.appendChild(input);
        row.append(label, inputWrap);
        fieldsPanel.appendChild(row);
    }

    card.append(header, body, autoToggle, autoPanel, editToggle, fieldsPanel);
    return card;
}

// ── Genre tag-select field ──

function createGenreField(game, appid) {
    const row = document.createElement("div");
    row.className = "field-row genre-field";

    const label = document.createElement("span");
    label.className = "field-label";
    label.textContent = "Genre";

    const inputWrap = document.createElement("div");
    inputWrap.className = "field-input genre-select-wrap";

    // Build options: detected tags first, then presets, then "Other..."
    const detectedTags = game.tags || [];
    const allOptions = buildGenreOptions(detectedTags, game.genre);

    const select = document.createElement("select");
    select.className = "select genre-select";

    for (const opt of allOptions) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.selected) option.selected = true;
        if (opt.disabled) option.disabled = true;
        if (opt.className) option.className = opt.className;
        select.appendChild(option);
    }

    // Custom input (shown when "Other..." is selected)
    const customInput = document.createElement("input");
    customInput.type = "text";
    customInput.className = "input genre-custom-input";
    customInput.placeholder = "Type custom genre...";
    customInput.style.display = "none";
    customInput.value = "";

    // If current genre is custom (not in any list), show it
    const isCustom = game.genre && !detectedTags.includes(game.genre) &&
                     !GENRE_PRESETS.includes(game.genre);
    if (isCustom) {
        select.value = "__other__";
        customInput.style.display = "block";
        customInput.value = game.genre;
    }

    select.addEventListener("change", () => {
        if (select.value === "__other__") {
            customInput.style.display = "block";
            customInput.focus();
        } else {
            customInput.style.display = "none";
            customInput.value = "";
            handleFieldUpdate(appid, "genre", select.value);
        }
    });

    customInput.addEventListener("change", () => {
        const val = customInput.value.trim();
        if (val) handleFieldUpdate(appid, "genre", val);
    });

    inputWrap.append(select, customInput);
    row.append(label, inputWrap);
    return row;
}

function buildGenreOptions(detectedTags, currentGenre) {
    const options = [];
    const seen = new Set();

    // Placeholder
    options.push({ value: "", label: "— Select genre —", disabled: true, selected: !currentGenre });

    // Detected tags from this game (prioritized)
    if (detectedTags.length > 0) {
        options.push({ value: "", label: "── From this game ──", disabled: true, className: "optgroup-label" });
        for (const tag of detectedTags) {
            if (seen.has(tag.toLowerCase())) continue;
            seen.add(tag.toLowerCase());
            options.push({
                             value: tag,
                             label: tag,
                             selected: currentGenre === tag,
                         });
        }
    }

    // Common presets (filtered to avoid duplicates)
    const unseen = GENRE_PRESETS.filter((p) => !seen.has(p.toLowerCase()));
    if (unseen.length > 0) {
        options.push({ value: "", label: "── Common genres ──", disabled: true, className: "optgroup-label" });
        for (const preset of unseen) {
            options.push({
                             value: preset,
                             label: preset,
                             selected: currentGenre === preset,
                         });
        }
    }

    // Other (custom)
    options.push({ value: "", label: "──────────", disabled: true });
    options.push({ value: "__other__", label: "Other (type custom)..." });

    return options;
}

// ── Helper: auto-detected read-only row ──

function makeAutoRow(labelText, value, fullText) {
    const row = document.createElement("div");
    row.className = "auto-row";

    const label = document.createElement("span");
    label.className = "auto-label";
    label.textContent = labelText;

    const val = document.createElement("span");
    val.className = "auto-value";
    val.textContent = value;
    if (fullText && fullText !== value) {
        val.title = fullText;
    }

    row.append(label, val);
    return row;
}

function makeMetaTag(text, cls) {
    const span = document.createElement("span");
    if (cls) span.className = cls;
    span.textContent = text;
    return span;
}

// ── Handlers ──

async function handleRemove(appid, name) {
    const resp = await sendMessage(MSG.REMOVE_FROM_QUEUE, { appid });
    if (resp?.ok) {
        showToast(`Removed: ${name || appid}`, "info");
        await loadQueue();
    } else {
        showToast(resp?.error || "Failed to remove", "error");
    }
}

async function handleFieldUpdate(appid, field, value) {
    const resp = await sendMessage(MSG.UPDATE_ENTRY, {
        appid,
        fields: { [field]: value },
    });
    if (!resp?.ok) {
        showToast(resp?.error || "Failed to update", "error");
    }
}

async function loadQueue() {
    const resp = await sendMessage(MSG.GET_QUEUE);
    const queue = resp?.ok ? resp.data : [];
    const filter = searchInput.value.trim();
    renderQueue(queue, filter);
}

// ── Events ──

searchInput.addEventListener("input", () => {
    const filter = searchInput.value.trim();
    renderQueue(currentQueue, filter);
});

refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    await loadQueue();
    refreshBtn.disabled = false;
    showToast("Queue refreshed", "info");
});

pushAllBtn.addEventListener("click", async () => {
    if (currentQueue.length === 0) return;

    const count = currentQueue.length;
    if (!confirm(`Push ${count} game(s) to GitHub?\nThis will append to scripts/temp_info.jsonl.`)) return;

    pushAllBtn.disabled = true;
    pushAllBtn.innerHTML = `<span class="spinner"></span> Pushing...`;

    const resp = await sendMessage(MSG.PUSH_QUEUE);

    if (resp?.ok) {
        const label = resp.signed ? " (GPG signed)" : "";
        showToast(`Pushed ${resp.pushed} game(s)${label}`, "success");
        await loadQueue();
    } else if (resp?.gpgFailed) {
        const fallback = confirm(`GPG signing failed: ${resp.error}\n\nPush unsigned instead?`);
        if (fallback) {
            pushAllBtn.innerHTML = `<span class="spinner"></span> Unsigned...`;
            const unsignedResp = await sendMessage(MSG.PUSH_QUEUE_UNSIGNED);
            if (unsignedResp?.ok) {
                showToast(`Pushed ${unsignedResp.pushed} game(s) (unsigned)`, "success");
                await loadQueue();
            } else {
                showToast(unsignedResp?.error || "Unsigned push failed", "error");
            }
        }
    } else {
        showToast(resp?.error || "Push failed", "error");
    }

    pushAllBtn.disabled = false;
    pushAllBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> Push All`;
});

clearAllBtn.addEventListener("click", async () => {
    if (currentQueue.length === 0) return;
    if (!confirm(`Remove all ${currentQueue.length} game(s) from queue?\nThis cannot be undone.`)) return;

    clearAllBtn.disabled = true;
    clearAllBtn.textContent = "Clearing...";

    for (const game of currentQueue) {
        const appid = extractAppId(game.link);
        if (appid) {
            await sendMessage(MSG.REMOVE_FROM_QUEUE, { appid });
        }
    }

    showToast(`Cleared ${currentQueue.length} game(s) from queue`, "info");
    await loadQueue();

    clearAllBtn.disabled = false;
    clearAllBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Clear`;
});

// ── Keyboard shortcuts ──

document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey && e.key === "f") || (e.key === "/" && document.activeElement !== searchInput)) {
        e.preventDefault();
        searchInput.focus();
    }
    if (e.key === "Escape" && document.activeElement === searchInput) {
        searchInput.value = "";
        renderQueue(currentQueue, "");
        searchInput.blur();
    }
});

// ── Init ──
document.addEventListener("DOMContentLoaded", loadQueue);
