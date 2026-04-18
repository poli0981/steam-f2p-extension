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

import { MSG, EDITABLE_FIELDS, AUTO_FIELDS, GENRE_PRESETS, STORAGE_KEYS } from "../shared/constants.js";
import { debounce, extractAppId, formatTime, truncate } from "../shared/utils.js";
import { $, sendMessage, showToast, showUndoToast } from "../shared/ui-helpers.js";
import { confirmDialog } from "../shared/modal.js";

// ── DOM refs ──
const queueCountEl = $("#queueCount");
const queueGrid = $("#queueGrid");
const emptyState = $("#emptyState");
const searchInput = $("#searchInput");
const refreshBtn = $("#refreshBtn");
const pushAllBtn = $("#pushAllBtn");
const pushSelectedBtn = $("#pushSelectedBtn");
const pushSelectedLabel = $("#pushSelectedLabel");
const clearAllBtn = $("#clearAllBtn");

let currentQueue = [];
// Selected appids for "Push Selected". Persists across re-renders; pruned
// to match currentQueue after every render so stale ids don't leak.
const selectedAppids = new Set();

// ── Render ──

function renderQueue(queue, filter = "") {
    currentQueue = queue;
    queueCountEl.textContent = queue.length;
    pushAllBtn.disabled = queue.length === 0;
    clearAllBtn.disabled = queue.length === 0;

    // Prune selection Set to only appids that still exist in the queue —
    // entries may have been pushed or removed via another tab.
    const liveAppids = new Set(queue.map((g) => extractAppId(g.link)).filter(Boolean));
    for (const id of [...selectedAppids]) {
        if (!liveAppids.has(id)) selectedAppids.delete(id);
    }
    updatePushSelectedBtn();

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
    if (selectedAppids.has(appid)) card.classList.add("is-selected");

    // ── Header with thumbnail ──
    const header = document.createElement("div");
    header.className = "game-card-header";

    const thumb = document.createElement("img");
    thumb.className = "game-card-thumb";
    thumb.src = game.header_image || "";
    thumb.alt = game.name || "";
    thumb.loading = "lazy";
    thumb.onerror = () => { thumb.src = ""; };

    // Selection checkbox (top-left). Stops event propagation so it doesn't
    // interfere with any future whole-card click handlers.
    const selectBox = document.createElement("input");
    selectBox.type = "checkbox";
    selectBox.className = "game-card-select";
    selectBox.title = "Include in 'Push Selected'";
    selectBox.checked = selectedAppids.has(appid);
    selectBox.addEventListener("click", (e) => e.stopPropagation());
    selectBox.addEventListener("change", () => {
        if (selectBox.checked) {
            selectedAppids.add(appid);
            card.classList.add("is-selected");
        } else {
            selectedAppids.delete(appid);
            card.classList.remove("is-selected");
        }
        updatePushSelectedBtn();
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "game-card-remove";
    removeBtn.title = "Remove from queue";
    removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    removeBtn.addEventListener("click", () => handleRemove(game));

    header.append(thumb, selectBox, removeBtn);

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

    // ── Info panel content (read-only auto-detected fields) ──
    const infoPanel = document.createElement("div");
    infoPanel.className  = "card-panel card-panel-info";
    infoPanel.id         = `panel-info-${appid}`;
    infoPanel.setAttribute("role", "tabpanel");
    infoPanel.setAttribute("aria-labelledby", `tab-info-${appid}`);

    if (game.description) {
        infoPanel.appendChild(makeAutoRow("Description", truncate(game.description, 200), game.description));
    }
    if (game.release_date) {
        infoPanel.appendChild(makeAutoRow("Release Date", game.release_date));
    }
    if (devStr) {
        infoPanel.appendChild(makeAutoRow("Developer", devStr));
    }
    const pubStr = Array.isArray(game.publisher)
                   ? game.publisher.join(", ")
                   : (game.publisher || "");
    if (pubStr && pubStr !== devStr) {
        infoPanel.appendChild(makeAutoRow("Publisher", pubStr));
    }
    if (game.platforms && game.platforms.length > 0) {
        infoPanel.appendChild(makeAutoRow("Platforms", game.platforms.join(", ")));
    }
    if (game.languages && game.languages.length > 0) {
        const langText = game.languages.length <= 5
                         ? game.languages.join(", ")
                         : `${game.languages.slice(0, 5).join(", ")} +${game.languages.length - 5} more`;
        infoPanel.appendChild(makeAutoRow("Languages", langText, game.languages.join(", ")));
    }
    if (game.tags && game.tags.length > 0) {
        const tagRow   = document.createElement("div");
        tagRow.className = "auto-row";
        const tagLabel = document.createElement("span");
        tagLabel.className  = "auto-label";
        tagLabel.textContent = "Tags";
        const tagList  = document.createElement("div");
        tagList.className = "auto-tags";
        for (const t of game.tags) {
            const chip = document.createElement("span");
            chip.className   = "tag-chip";
            chip.textContent = t;
            tagList.appendChild(chip);
        }
        tagRow.append(tagLabel, tagList);
        infoPanel.appendChild(tagRow);
    }

    // Graceful empty state when a DLC/demo card has no auto-detected info
    if (infoPanel.childElementCount === 0) {
        const empty = document.createElement("div");
        empty.className     = "card-panel-empty";
        empty.textContent   = "No auto-detected info available for this entry.";
        infoPanel.appendChild(empty);
    }

    // ── Edit panel content (user-editable fields) ──
    const editPanel = document.createElement("div");
    editPanel.className = "card-panel card-panel-edit";
    editPanel.id        = `panel-edit-${appid}`;
    editPanel.setAttribute("role", "tabpanel");
    editPanel.setAttribute("aria-labelledby", `tab-edit-${appid}`);
    editPanel.hidden    = true;  // info is the default visible tab

    editPanel.appendChild(createGenreField(game, appid));

    for (const [key, def] of Object.entries(EDITABLE_FIELDS)) {
        if (key === "genre") continue; // handled above

        const row = document.createElement("div");
        row.className = "field-row";

        const label = document.createElement("span");
        label.className   = "field-label";
        label.textContent = def.label;

        const inputWrap = document.createElement("div");
        inputWrap.className = "field-input";

        let input;
        if (def.type === "select") {
            input = document.createElement("select");
            input.className = "select";
            for (const opt of def.options) {
                const option = document.createElement("option");
                option.value       = opt;
                option.textContent = opt;
                if (game[key] === opt) option.selected = true;
                input.appendChild(option);
            }
        } else {
            input = document.createElement("input");
            input.type        = "text";
            input.className   = "input";
            input.placeholder = def.placeholder || "";
            input.value       = game[key] || "";
        }

        input.dataset.field = key;
        input.addEventListener("change", () => handleFieldUpdate(appid, key, input.value));

        inputWrap.appendChild(input);
        row.append(label, inputWrap);
        editPanel.appendChild(row);
    }

    // ── Tab bar ──
    const tablist = document.createElement("div");
    tablist.className = "card-tabs";
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-label", "Card sections");

    const infoTab = document.createElement("button");
    infoTab.type      = "button";
    infoTab.className = "card-tab card-tab-active";
    infoTab.id        = `tab-info-${appid}`;
    infoTab.textContent = "Info";
    infoTab.setAttribute("role", "tab");
    infoTab.setAttribute("aria-selected", "true");
    infoTab.setAttribute("aria-controls", `panel-info-${appid}`);
    infoTab.tabIndex = 0;

    const editTab = document.createElement("button");
    editTab.type      = "button";
    editTab.className = "card-tab";
    editTab.id        = `tab-edit-${appid}`;
    editTab.textContent = "Edit";
    editTab.setAttribute("role", "tab");
    editTab.setAttribute("aria-selected", "false");
    editTab.setAttribute("aria-controls", `panel-edit-${appid}`);
    editTab.tabIndex = -1;

    const activateTab = (target) => {
        const isInfo = target === infoTab;
        infoTab.classList.toggle("card-tab-active", isInfo);
        editTab.classList.toggle("card-tab-active", !isInfo);
        infoTab.setAttribute("aria-selected", String(isInfo));
        editTab.setAttribute("aria-selected", String(!isInfo));
        infoTab.tabIndex  = isInfo ? 0 : -1;
        editTab.tabIndex  = isInfo ? -1 : 0;
        infoPanel.hidden  = !isInfo;
        editPanel.hidden  = isInfo;
        target.focus({ preventScroll: true });
    };

    infoTab.addEventListener("click", () => activateTab(infoTab));
    editTab.addEventListener("click", () => activateTab(editTab));

    // Arrow-key navigation — standard ARIA tablist pattern
    tablist.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const next = document.activeElement === infoTab ? editTab : infoTab;
            activateTab(next);
        } else if (e.key === "Home") {
            e.preventDefault();
            activateTab(infoTab);
        } else if (e.key === "End") {
            e.preventDefault();
            activateTab(editTab);
        }
    });

    tablist.append(infoTab, editTab);

    // ── Single collapsible details section containing tabs + panels ──
    const details = document.createElement("div");
    details.className = "game-card-details";
    details.hidden    = true;
    details.append(tablist, infoPanel, editPanel);

    const toggle = document.createElement("button");
    toggle.type      = "button";
    toggle.className = "game-card-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", `details-${appid}`);
    details.id = `details-${appid}`;

    const renderToggle = (isOpen) => {
        toggle.textContent = isOpen ? "▴ Hide details" : "▾ Details";
        toggle.setAttribute("aria-expanded", String(isOpen));
    };
    renderToggle(false);

    toggle.addEventListener("click", () => {
        const nowOpen = details.hidden;
        details.hidden = !nowOpen;
        renderToggle(nowOpen);
    });

    card.append(header, body, toggle, details);
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

/**
 * Build a single skeleton game card used during initial queue load.
 * Dimensions mirror the real card so there is no layout shift when
 * the real data arrives.
 */
function createSkeletonCard() {
    const card = document.createElement("div");
    card.className = "game-card game-card-skeleton";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = `
        <div class="skeleton game-card-thumb"></div>
        <div class="game-card-body">
            <div class="skeleton skeleton-line" style="width:72%; height:14px; margin-bottom:10px;"></div>
            <div class="game-card-meta">
                <span class="skeleton" style="width:56px; height:14px; border-radius:3px;"></span>
                <span class="skeleton" style="width:72px; height:14px; border-radius:3px;"></span>
                <span class="skeleton" style="width:44px; height:14px; border-radius:3px;"></span>
            </div>
        </div>
        <div class="skeleton" style="width:100%; height:26px; border-radius:0; margin-top:1px;"></div>
    `;
    return card;
}

function renderSkeletonCards(count = 3) {
    emptyState.style.display = "none";
    queueGrid.innerHTML = "";
    queueGrid.style.display = "grid";
    for (let i = 0; i < count; i++) {
        queueGrid.appendChild(createSkeletonCard());
    }
}

// ── Handlers ──

function updatePushSelectedBtn() {
    const n = selectedAppids.size;
    pushSelectedBtn.disabled = n === 0;
    pushSelectedLabel.textContent = n > 0 ? `Push Selected (${n})` : "Push Selected";
}

/**
 * Remove a game and offer an Undo toast that restores the exact entry
 * (preserving added_at, notes, etc.) via MSG.RESTORE_ENTRY.
 *
 * Accepts the full game object so the entry can be sent back verbatim.
 */
async function handleRemove(game) {
    const appid = extractAppId(game.link);
    if (!appid) return;

    // Keep a deep-enough copy in case the user undoes after further edits
    // elsewhere. JSONL entries are plain data, structuredClone handles them.
    const snapshot = structuredClone(game);

    const resp = await sendMessage(MSG.REMOVE_FROM_QUEUE, { appid });
    if (!resp?.ok) {
        showToast(resp?.error || "Failed to remove", "error");
        return;
    }

    // Selection cleanup — the entry is gone from storage
    selectedAppids.delete(appid);
    await loadQueue();

    showUndoToast(`Removed: ${game.name || appid}`, async () => {
        const restoreResp = await sendMessage(MSG.RESTORE_ENTRY, { entry: snapshot });
        if (restoreResp?.ok) {
            showToast("Restored", "success");
            await loadQueue();
        } else {
            showToast(restoreResp?.error || "Undo failed", "error");
        }
    });
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

let isFirstLoad = true;

async function loadQueue() {
    // Show skeletons only on the very first load — auto-refresh should
    // re-render silently without a flash.
    if (isFirstLoad) {
        renderSkeletonCards(3);
        isFirstLoad = false;
    }
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

/**
 * Shared push flow with GPG fallback. Called by both pushAllBtn and
 * pushSelectedBtn.
 *
 * @param {object} opts
 * @param {string[]} [opts.appids] - Specific appids to push, or undefined for all
 * @param {HTMLButtonElement} opts.btn - Button to spinner/disable
 * @param {string} opts.originalHTML - Original innerHTML to restore on done
 * @param {() => void} [opts.onSuccess] - Extra work after a successful push
 */
async function runPush({ appids, btn, originalHTML, onSuccess }) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Pushing...`;

    const payload = appids ? { appids } : undefined;
    const resp = await sendMessage(MSG.PUSH_QUEUE, payload);

    if (resp?.ok) {
        const label = resp.signed ? " (GPG signed)" : "";
        showToast(`Pushed ${resp.pushed} game(s)${label}`, "success");
        if (onSuccess) onSuccess();
        await loadQueue();
    } else if (resp?.gpgFailed) {
        const fallback = await confirmDialog({
            title: "GPG signing failed",
            message: `${resp.error}\n\nPush unsigned instead?`,
            confirmLabel: "Push unsigned",
            cancelLabel:  "Cancel",
            defaultAction: "cancel",
        });
        if (fallback) {
            btn.innerHTML = `<span class="spinner"></span> Unsigned...`;
            const unsignedResp = await sendMessage(MSG.PUSH_QUEUE_UNSIGNED, payload);
            if (unsignedResp?.ok) {
                showToast(`Pushed ${unsignedResp.pushed} game(s) (unsigned)`, "success");
                if (onSuccess) onSuccess();
                await loadQueue();
            } else {
                showToast(unsignedResp?.error || "Unsigned push failed", "error");
            }
        }
    } else {
        showToast(resp?.error || "Push failed", "error");
    }

    btn.disabled = false;
    btn.innerHTML = originalHTML;
}

pushAllBtn.addEventListener("click", async () => {
    if (currentQueue.length === 0) return;

    const count = currentQueue.length;
    const ok = await confirmDialog({
        title:        `Push ${count} game${count === 1 ? "" : "s"}?`,
        message:      "Entries will be staged for ingest into the tracker.",
        confirmLabel: "Push all",
        cancelLabel:  "Cancel",
        defaultAction: "confirm",
    });
    if (!ok) return;

    await runPush({
        appids: undefined,
        btn: pushAllBtn,
        originalHTML: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> Push All`,
    });
});

pushSelectedBtn.addEventListener("click", async () => {
    if (selectedAppids.size === 0) return;

    const count = selectedAppids.size;
    const ok = await confirmDialog({
        title:        `Push ${count} selected game${count === 1 ? "" : "s"}?`,
        message:      "Entries will be staged for ingest into the tracker.",
        confirmLabel: `Push ${count}`,
        cancelLabel:  "Cancel",
        defaultAction: "confirm",
    });
    if (!ok) return;

    const appids = [...selectedAppids];
    const originalHTML = pushSelectedBtn.innerHTML;

    await runPush({
        appids,
        btn: pushSelectedBtn,
        originalHTML,
        onSuccess: () => {
            // The pushed entries are now gone from the queue; prune matching
            // selections. renderQueue() will also re-prune, this just keeps
            // state accurate between push and re-render.
            for (const id of appids) selectedAppids.delete(id);
            updatePushSelectedBtn();
        },
    });
});

clearAllBtn.addEventListener("click", async () => {
    if (currentQueue.length === 0) return;
    const count = currentQueue.length;
    const ok = await confirmDialog({
        title:        `Clear ${count} game${count === 1 ? "" : "s"}?`,
        message:      "You will have a few seconds to Undo after clearing.",
        confirmLabel: "Clear",
        cancelLabel:  "Cancel",
        danger:       true,
        defaultAction: "cancel",
    });
    if (!ok) return;

    clearAllBtn.disabled = true;
    clearAllBtn.textContent = "Clearing...";

    // Snapshot the current queue so Undo can restore the whole batch with
    // original timestamps and user edits intact.
    const snapshot = structuredClone(currentQueue);
    const cleared = snapshot.length;

    for (const game of snapshot) {
        const appid = extractAppId(game.link);
        if (appid) {
            await sendMessage(MSG.REMOVE_FROM_QUEUE, { appid });
        }
    }

    selectedAppids.clear();
    await loadQueue();

    showUndoToast(`Cleared ${cleared} game(s)`, async () => {
        const restoreResp = await sendMessage(MSG.RESTORE_ENTRY, { entries: snapshot });
        if (restoreResp?.ok) {
            const skipped = restoreResp.skipped || 0;
            const msg = skipped > 0
                ? `Restored ${restoreResp.restored}, skipped ${skipped}`
                : `Restored ${restoreResp.restored} game(s)`;
            showToast(msg, "success");
            await loadQueue();
        } else {
            showToast(restoreResp?.error || "Undo failed", "error");
        }
    }, { duration: 8000 });

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

// ── Auto-refresh when queue storage changes elsewhere ──
// Fires when the popup adds a game, the service worker removes one, or an
// auto-push drains entries. Debounced so bursts of updates coalesce into a
// single re-render.
const refreshFromStorage = debounce(() => loadQueue(), 150);

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEYS.QUEUE]) {
        refreshFromStorage();
    }
});

// ── Init ──
document.addEventListener("DOMContentLoaded", loadQueue);
