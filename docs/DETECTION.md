# Detection Flow

How the Steam F2P Tracker extension detects, classifies, and queues
free-to-play Steam games. This is the authoritative, code-level
walkthrough of the detection pipeline — the page-type classifiers, price
and free-type logic, anti-cheat passes, the auto-collect gate, the
deduplication path, and the search-page hover feature.

For the higher-level picture see the [Architecture](../README.md#architecture)
and [Data Flow](../README.md#data-flow) sections of the README. For the
final on-disk record, see [Push Data Format](../README.md#push-data-format).

> **Heuristic, not authoritative.** Detection reads Steam's public page
> markup, which changes without notice and varies by region, login state,
> and A/B test. Treat every detected field as a best-effort guess — see
> [DISCLAIMER.md](DISCLAIMER.md). The editable queue fields exist exactly
> so a human can correct what the scraper gets wrong.

## Contents

- [1. Where detection runs](#1-where-detection-runs)
- [2. The shared namespace](#2-the-shared-namespace)
- [3. App-page pipeline](#3-app-page-pipeline)
  - [3.1 Page-type fast path](#31-page-type-fast-path)
  - [3.2 Price detection](#32-price-detection)
  - [3.3 Free-type classification](#33-free-type-classification)
  - [3.4 Online / offline](#34-online--offline)
  - [3.5 Anti-cheat (two passes)](#35-anti-cheat-two-passes)
  - [3.6 Metadata](#36-metadata)
- [4. From page to queue](#4-from-page-to-queue)
  - [4.1 GAME_DETECTED and the popup](#41-game_detected-and-the-popup)
  - [4.2 The auto-collect gate](#42-the-auto-collect-gate)
  - [4.3 Deduplication](#43-deduplication)
- [5. Search-page detection](#5-search-page-detection)
- [6. Field reference](#6-field-reference)
- [7. Performance notes](#7-performance-notes)
- [8. Settings that affect detection](#8-settings-that-affect-detection)

---

## 1. Where detection runs

Detection lives entirely in **content scripts** declared in
[`manifest.json`](../manifest.json). There are two independent entries,
each matching a different family of Steam URLs:

| Match pattern | Scripts | Purpose |
|---|---|---|
| `https://store.steampowered.com/app/*` | `ns.js`, `lib-dom.js`, `in-page-toast.js`, the six `extract-*.js` modules, `detector.js` | Detect one game per app page |
| `https://store.steampowered.com/search*` | `ns.js`, `in-page-toast.js`, `search-detector.js` | Detect many games on hover from a results page |

Both run at `document_idle`. Content scripts here are **plain IIFEs, not
ES modules** — they cannot `import`. Shared state and functions are
attached to a single global object (see §2). Message-type strings (e.g.
`"GAME_DETECTED"`, `"AUTO_ADD_FROM_PAGE"`) are hard-coded to match the
`MSG` map in [`shared/constants.js`](../shared/constants.js); the string
contract is the boundary between the content scripts and the service
worker.

## 2. The shared namespace

`content/ns.js` runs first and creates `globalThis.SF2P`. Every other
content-script file attaches its functions to that object — for example
`SF2P.classifyFreeType`, `SF2P.detectAntiCheat`, `SF2P.showInPageToast`.
The **load order in the manifest is significant**: `ns.js` must be first
and the orchestrator (`detector.js`) last, because the orchestrator calls
functions the earlier files registered.

`content/lib-dom.js` provides the low-level DOM helpers (`textOf`,
`textsOf`, `hasCheck`, `escapeRegex`) and a small set of **lazily cached
selectors** (popular tags, breadcrumbs, dev rows, the header grid
container) reused across extractors. The cache is cleared via
`SF2P.clearDomCache()` before a re-scan.

## 3. App-page pipeline

`content/detector.js` is the orchestrator. It reads the appid from the
URL (`/app/(\d+)/`), then runs `SF2P.runDetection()` once at
`document_idle` and again whenever the popup sends `RESCAN_PAGE` (the
**Scan Page** button — it clears the lib-dom cache first so late-loading
DOM is picked up).

### 3.1 Page-type fast path

Before any expensive work, the orchestrator runs a set of cheap
classifiers from [`content/extract-type.js`](../content/extract-type.js).
If **any** returns true, the page is something that must never be queued,
so the detector emits a minimal payload (name, header image, genre,
developer, plus the flag) and **returns early**, skipping anti-cheat,
the language table, and the full tag scrape.

| Classifier | Signal | Flag |
|---|---|---|
| `isDLCPage()` | `.game_area_dlc_bubble`, "downloadable content" breadcrumb/genre | `is_dlc` |
| `isDemo()` | "demo" breadcrumb, "download demo" purchase text, name suffix | `is_demo` → `free_type: "demo"` |
| `isPlaytest()` | "join playtest" / "request access", playtest section | `is_playtest` → `free_type: "playtest"` |
| `isUnavailable()` | `#purchase_note` "no longer available" | `is_unavailable` |
| `isComingSoon()` | `.game_area_comingsoon`, "not yet available" | `is_coming_soon` |
| `isModPage()` | `.game_area_mod_bubble` ("Community-Made Mod") | `is_mod` |
| `isVideoPage()` | `<h2>Steam Video</h2>` + "only available in an online streaming format" | `is_video` |

> **Why mods and videos matter (v2.4.0).** A community-made mod page
> advertises **"Free To Play"** with an **"Install now"** button — so
> without `isModPage()` it would sail through the free-type logic below
> and be auto-queued. A Steam Video product is likewise not a game. Both
> are detected here and blocked downstream. `isVideoPage()` anchors on the
> exact `Steam Video` heading because `.game_area_description` exists on
> every app page.

### 3.2 Price detection

For a base game (no fast-path flag), price is resolved in
[`content/extract-price.js`](../content/extract-price.js), most-reliable
source first:

1. **schema.org** — `getBasePriceFromSchema()` reads the first
   `[itemtype="http://schema.org/Offer"]` **outside** the DLC section and
   its `<meta itemprop="price">`. `price == 0` → free.
2. **DOM fallback** — `getBasePriceFromDOM()` parses
   `.game_area_purchase_game` blocks (skipping bundles and DLC), reading
   `.game_purchase_price` / `.discount_final_price`. It also returns a
   `freeHint` of `"f2p"`, `"free_game"`, or `"demo"` from the price text.
3. **Tag fallback** — if neither yields a price, the presence of a
   "free to play" tag in the glance/genre area decides `isFree`.

`detectPaidDLC()` separately scans `#gameAreaDLCSection` for any
non-free DLC row to flag `has_paid_dlc` (rolled into auto-notes).

### 3.3 Free-type classification

`SF2P.classifyFreeType(isFree, hasPaidDLC, freeHint)` returns one of
**`f2p` · `free_game` · `paid` · `demo`**:

- not free → `paid`
- `freeHint === "demo"` → `demo`
- `freeHint === "f2p"` → `f2p`
- otherwise: a "free to play" tag, an in-app-purchase / microtransaction
  signal, or paid DLC → `f2p`; else → `free_game`.

The orchestrator maps that to the stored `is_free`: `f2p`/`free_game` →
`true`, `paid` → `false`, anything else → `null`.

### 3.4 Online / offline

`detectOnlineOffline()` in
[`content/extract-platform.js`](../content/extract-platform.js) inspects
category chips and popular tags for multiplayer signals (multiplayer,
online co-op/pvp, MMO, battle royale, …) → `type_game` of `"online"` or
`"offline"`. `extractPlatforms()` maps the `.platform_img` classes
(`win` / `mac` / `linux` / …) to `["Windows", "macOS", "Linux", …]`.

### 3.5 Anti-cheat (two passes)

Anti-cheat detection ([`content/extract-anticheat.js`](../content/extract-anticheat.js))
runs **only for `online` games** — offline titles rarely ship AC, and
skipping saves work. Two passes:

1. **Structured.** Read Steam's `.anticheat_section` elements:
   `.anticheat_name` for the system, with kernel-level classification
   from a `.DRM_notice` class or "kernel level" text
   (`isKernel: true | false | null`).
2. **Dictionary fallback.** If no structured section exists, scan known
   page zones against a 20-system pattern database (VAC, EAC, BattlEye,
   Vanguard, …). **Short codes (≤ 5 chars like `vac`, `eac`) match on a
   word boundary** (`\bvac\b`, via `escapeRegex()`) so prose like
   "vacation" doesn't false-positive (v2.3.0); longer/multi-word patterns
   keep a substring match. The label feeds the editable `anti_cheat` field
   and an auto-note; `is_kernel_ac` drives a popup warning badge.

### 3.6 Metadata

[`content/extract-metadata.js`](../content/extract-metadata.js) and
[`content/extract-lang-tags.js`](../content/extract-lang-tags.js) gather
the read-only fields: `name`, `header_image`, `description`, `developer[]`,
`publisher[]`, `release_date`, `genre`, `platforms[]`, `languages[]` +
`language_details[]` (interface/audio/subtitles per language), and the
popular `tags[]`. Developer/publisher extraction handles both the modern
header-grid layout and the legacy `.dev_row` layout.

## 4. From page to queue

### 4.1 GAME_DETECTED and the popup

The orchestrator packs everything into a `gameData` object and sends
`GAME_DETECTED` to the service worker
([`background/sw.js`](../background/sw.js)), which stores it in a
**per-tab `Map`**. When the user opens the popup it requests
`GET_DETECTED_GAME` for the active tab and renders the card. The popup
**blocks** the non-queueable page types — `is_unavailable`,
`is_coming_soon`, `is_mod`, `is_video`, `is_dlc`, demo, playtest, and
`is_free === false` each disable the **Add to Queue** button with an
explanatory badge.

### 4.2 The auto-collect gate

Immediately after `GAME_DETECTED`, the orchestrator fires
`AUTO_ADD_FROM_PAGE` (fire-and-forget) with the `gameData` and a
`classification`. **The service worker is the single source of truth**
for whether anything is queued and which toast is shown — the content
script just renders whatever directive comes back. This keeps the toggle
live (no content-script reload) and centralizes the cooldown.

The gate, in order:

1. **Enabled?** `source: "page"` requires the `auto_collect` setting;
   `source: "search"` requires `search_detect` (see §5). If off →
   `{silent: true}`.
2. **Cooldown.** A per-appid key `cooldown:autoadd:<appid>` in
   `chrome.storage.session` suppresses repeat processing for
   `AUTO_COLLECT_COOLDOWN_MS` (5 min) within a session. Explicit clicks
   bypass it.
3. **Blocked types.** `is_dlc` / `is_demo` / `is_playtest` /
   `is_unavailable` / `is_coming_soon` / `is_mod` / `is_video` → never
   enqueue; optional info/warning toast (gated by `notify_dlc_demo`). The
   mod/video checks run **before** the free path so a "Free To Play" mod
   is caught.
4. **Paid.** `free_type === "paid"` → never enqueue (toast gated by
   `notify_not_free`).
5. **Free.** `f2p` / `free_game` → dedup check (§4.3); if new, `addToQueue()`.
   Outcomes return a structured `action` (`added`, `duplicate`,
   `master_duplicate`, `queue_full`, …) and a **pre-localized** message
   built from [`shared/notification-text.js`](../shared/notification-text.js)
   (EN + VI, resolved from `notify_lang`). The content script renders it
   via `SF2P.showInPageToast()` — a Shadow-DOM toast hosted on
   `document.documentElement` so Steam's CSS can't reach it.

### 4.3 Deduplication

`checkDuplicate(appid)` in
[`background/dedup-checker.js`](../background/dedup-checker.js) checks two
places:

1. **Local queue** (instant) → `{isDuplicate: true, source: "queue"}`.
2. **Remote master DB** — fetches `data/index.json` from the tracker repo,
   then the sharded `data/data_NNN.jsonl` files, building an appid `Set`
   cached for `cache_ttl_minutes` (default 5). A hit →
   `{source: "remote"}`.

It **fails open**: if the remote fetch errors, it returns
`isDuplicate: false` with a `warning` so a network blip never blocks a
legitimate add. The same set powers the **auto-prune** of already-tracked
queue entries on cache refresh (`auto_prune_queue`).

## 5. Search-page detection

`content/search-detector.js` (v2.5.0) brings detection to the
**search results page** so free games can be triaged without opening each
app page. It is opt-in via `search_detect`.

- **Category gate.** If the search URL's `category1` parameter contains a
  non-game value — `{10, 21, 989, 990, 992, 997}` = demo / DLC / playtest /
  soundtrack / video / mod (comma- or `%2C`-joined; `ndl` is ignored) —
  the page is showing non-games, so the script shows a one-time
  "wrong category" toast and attaches no handlers.
- **Hover via delegation.** A single `mouseover` listener on `document`
  finds the hovered `.search_result_row` (`closest()`), so dynamically
  loaded rows (infinite scroll, filter re-renders) are covered without
  re-binding. A short debounce (~220 ms) means a quick scroll-by doesn't
  trigger work.
- **Row read.** `data-ds-appid`, `.title`, the capsule image, platform
  icons, and release date come straight off the row. A **Steam Video /
  series** is recognised here from a `streamingvideo…` platform icon (it
  streams rather than running on an OS). The price signal otherwise:
  `.discount_final_price.free` → **free** (incl. F2P); a non-zero
  `data-price-final` with a price element → **paid**; an empty discount
  block → **upcoming / skip**.
- **Non-game guard (v2.6.1).** A search row otherwise can't tell a free
  game apart from a mod, DLC, soundtrack, or demo — they all show "Free"
  with normal OS icons (a free mod like tModLoader is field-for-field
  identical to a free game). So before a free row is offered for queueing,
  the service worker confirms the app `type` via Steam's `appdetails` API
  (`CHECK_APP_TYPE`, cached per appid); only `type: "game"` stays addable.
  Mods, DLC, soundtracks, and demos get a muted "not a game" status with no
  Add button. An unreachable API **fails open** (treated as a game) so a
  transient error never blocks a genuine free game.
- **Status tooltip.** For a free game it sends `CHECK_DUPLICATE` (cached
  per appid for the page) and shows an isolated Shadow-DOM tooltip:
  *free — not tracked* (with an **Add** button), *already in your queue*,
  or *already in the tracker database*. Paid / upcoming / non-game rows
  show a muted status only.
- **Adding.** Both paths route through the same `AUTO_ADD_FROM_PAGE`
  handler with `source: "search"` and `classification: {free_type: "free_game"}`:
  - an explicit **Add** click → `trigger: "click"` (bypasses the session
    cooldown so the user always gets feedback);
  - **auto-add on hover** (`search_autoadd_on_hover`) → `trigger: "hover"`
    on a sustained hover, respecting the cooldown.

  The service worker re-runs the same dedup + cooldown + queue logic, so a
  game already in the master DB is never re-added.

> **Lightweight entries.** A search row exposes only name, capsule image,
> platforms, and release date. Games added from search therefore have
> **blank developer / publisher / tags / description / anti-cheat** — all
> of which remain user-editable in the queue. Open the app page (and use
> the popup) when you want the fully-enriched record.

## 6. Field reference

Field definitions live in [`shared/constants.js`](../shared/constants.js)
(`AUTO_FIELDS`, `EDITABLE_FIELDS`).

**Auto-detected (read-only in the queue UI):** `name`, `header_image`,
`description`, `release_date`, `developer[]`, `publisher[]`, `platforms[]`,
`languages[]`, `language_details[]`, `tags[]`.

**User-editable:** `type_game` (online/offline), `anti_cheat`, `genre`,
`notes`, `safe` (`?`/`yes`/`no`).

**Transient classification (not stored, drives the gate):** `free_type`
(`f2p` / `free_game` / `paid` / `demo`) and the boolean page-type flags
`is_dlc` / `is_demo` / `is_playtest` / `is_unavailable` / `is_coming_soon` /
`is_mod` / `is_video`.

The full 20-field JSONL record that a queued entry becomes on push is
documented in [Push Data Format](../README.md#push-data-format).

## 7. Performance notes

- **Fast-path early return** skips anti-cheat, the language table, and the
  full tag scrape for DLC / demo / playtest / delisted / coming-soon /
  mod / video pages (~40% of detection time on those pages).
- **Cached selectors** in `lib-dom.js` are queried once per page load.
- **Anti-cheat runs only for `online` games.**
- **Search hover** is debounced and its `CHECK_DUPLICATE` results are
  cached per appid for the page session, so re-hovering a row is free.

## 8. Settings that affect detection

| Setting | Default | Effect |
|---|---|---|
| `auto_collect` | off | Master switch for app-page auto-queueing |
| `notify_added` / `notify_not_free` / `notify_dlc_demo` / `notify_duplicate` / `notify_queue_full` | on | Which auto-collect outcomes show a toast |
| `notify_lang` | `auto` | Toast/tooltip language (`auto` / `en` / `vi`) |
| `search_detect` | off | Master switch for search-page detection (§5) |
| `search_autoadd_on_hover` | off | Queue free games on hover vs. an explicit Add button |
| `cache_ttl_minutes` | 5 | Lifetime of the remote dedup appid cache |
| `auto_prune_queue` | on | Drop already-tracked entries on cache refresh |

---

*Related: [README → Architecture](../README.md#architecture) ·
[README → Anti-Cheat Detection](../README.md#anti-cheat-detection) ·
[README → Push Data Format](../README.md#push-data-format) ·
[DISCLAIMER.md](DISCLAIMER.md)*
