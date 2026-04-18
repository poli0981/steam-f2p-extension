# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.10.0] - 2026-04-19

### Added

- **Skeleton loaders** replace static "Checking page…" text and blank initial render:
  - **Popup** `#detectedLoading` now shows a skeleton preview of the detected-game card (thumbnail, two name/meta
    lines, two badge chips, and an action button placeholder). Layout dimensions match the real card so there is
    zero layout shift when the real data arrives. The old "Checking page…" text is moved to a `.sr-only` live
    region for screen readers.
  - **Queue page** renders three skeleton cards on the very first load via a new `renderSkeletonCards(3)` helper
    in `queue.js`. An `isFirstLoad` flag ensures subsequent re-renders (auto-refresh via `chrome.storage.onChanged`,
    manual Refresh button) never flash skeletons — only the initial cold load shows them.
- New `.skeleton` + `.skeleton-line` utility classes in `shared/theme.css`:
  - Linear-gradient shimmer (1.5 s loop) using `--bg-card` → `--bg-hover` → `--bg-card`
  - Theme-aware — auto light-mode branch swaps the gradient stops for lighter surfaces
  - `pointer-events: none` + `user-select: none` so skeletons don't steal hover / select interactions
  - Honours `@media (prefers-reduced-motion: reduce)` — shimmer animation disabled, solid peak colour held

### Styling

- `.game-card-skeleton` in `queue/queue.css` disables the v1.7.0 hover-lift effect on placeholder cards.
- `.detected-loading` CSS simplified — no longer forces `text-align: center` (skeleton layout is a row).

### ARIA

- `#detectedLoading` carries `aria-busy="true"` + `aria-live="polite"` so assistive tech announces the loading
  state without reading the decorative skeleton divs.

---

## [1.9.0] - 2026-04-19

### Changed

- **Queue card redesign.** Replaces the two separate collapsible panels (`▾ Game Info (auto-detected)` and
  `▾ Edit fields`) with a **single expandable *Details* section containing two tabs: Info / Edit**. Reduces
  collapsed card height by ~30 px and makes the information hierarchy clearer — one affordance to expand, a
  familiar tab pattern to switch context.
- Info tab is the default visible panel; Edit tab is hidden until clicked.
- ARIA: proper `role="tablist"` / `role="tab"` / `role="tabpanel"`, `aria-selected`, `aria-controls`,
  `aria-labelledby`, plus Arrow-Left / Arrow-Right / Home / End keyboard navigation. Only the active tab is
  tab-reachable (roving tabindex).
- Graceful empty state inside the Info panel when an entry has no auto-detected metadata.
- Toggle button now carries `aria-expanded` + `aria-controls`, keyboard-accessible.

### Styling

- New `.card-tabs`, `.card-tab`, `.card-tab-active`, `.card-panel`, `.card-panel-empty` in `queue/queue.css`.
  Active tab gets an underline indicator in the accent colour.
- Slide-in animation when the details section opens.
- Retired old `.game-card-auto`, `.game-card-fields`, `.auto-toggle`, `.edit-toggle` CSS blocks — no references
  left.

### Phase B progress

Remaining: skeleton loaders, in-app theme toggle UI, toast stack with undo progress bar.

---

## [1.8.0] - 2026-04-19

### Added

- **Themed confirmation dialog** — new `shared/modal.js` exports `confirmDialog({title, message, confirmLabel,
  cancelLabel, danger, defaultAction})` returning `Promise<boolean>`. Matches the extension's design system with
  `backdrop-filter` blur, spring entry animation, and adapts automatically to the light theme shipped in v1.7.0.
- Keyboard: `Enter` confirms, `Esc` cancels, `Tab` cycles focus between the two buttons (focus trap). Clicking the
  backdrop cancels. Focus is returned to the previously focused element after close.
- ARIA: `role="alertdialog"` + `aria-modal="true"` + `aria-labelledby`/`aria-describedby` for screen readers.
- Modal styles in `shared/theme.css` (dark + light variants). Compact padding via `@media (max-width: 480px)` so the
  modal fits nicely inside the 360 px popup.

### Changed

- **All 5 native `confirm()` call sites replaced** with `confirmDialog()`:
  - `queue.js`: Push All, Push Selected, Clear All (danger variant), GPG-signing-failed fallback
  - `popup.js`: GPG-signing-failed fallback
- Confirm wording tightened (singular/plural handling, clearer button labels like "Push 3" instead of generic
  "OK").

### Phase B progress

First ship of the v2.0.0 structural refresh roadmap. Remaining:
queue card redesign (tabs), skeleton loaders, in-app theme toggle,
toast stack with undo progress bar.

---

## [1.7.0] - 2026-04-19

### Added

- **Bundled Inter Variable font** at `lib/fonts/InterVariable.woff2` (~344 KB). Loaded via `@font-face` in
  `shared/theme.css` — no external CDN, MV3-safe. `font-display: swap` preserves instant-text-render with the
  system-font fallback while the woff2 loads.
- **Auto light theme** via `@media (prefers-color-scheme: light)`. A full token override inside `shared/theme.css`
  adapts backgrounds, text, accents, borders and shadows for light-mode users. No in-app toggle yet (that ships in
  v2.0.0 as part of the full refresh).
- **`.tabular-nums` utility class** and `font-variant-numeric: tabular-nums` on counters — queue count, log
  timestamps, activity times — so digits no longer shuffle width.
- **Reduced-motion support** — `@media (prefers-reduced-motion: reduce)` disables transforms and animations.

### Changed

- **Palette refresh** in `shared/theme.css`:
  - `--text-muted` `#5A6B7A` → `#7A8FA3` — now passes WCAG AA 4.5:1 on `--bg-card`. The old value was ~3.6:1.
  - `--accent-red` `#E74C3C` → `#F87171` (Tailwind red-400), hovers and contrast token adjusted.
  - `--accent-green` `#4FC978` → `#34D399` (emerald-400).
  - `--accent-yellow` `#F39C12` → `#FBBF24` (amber-400).
  - Kept Steam-blue `#66C0F4` as primary accent — the extension's identity colour.
  - Introduced `--accent-contrast`, `--accent-green-contrast`, `--accent-red-contrast`, `--accent-yellow-contrast`
    tokens so button and toast text colour flips correctly between dark and light modes.
- **Typography stack** now leads with `"Inter Variable", "Inter", "Segoe UI Variable Text", "Segoe UI",
  -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`. Inter renders consistently across OSes
  thanks to the local bundle; system variable fonts (Segoe UI Variable on Win11, SF Pro Text on macOS) are the
  graceful fallback.
- **Body** enables Inter stylistic sets (`cv11`, `ss01`) and grayscale antialiasing for sharper glyph edges.
- **Layered box-shadow tokens** — `--shadow-sm/md/lg` are now dual-pass shadows for realistic depth. Harmonised
  with separate values for light mode.
- **`.card` and `.game-card`** now translate up 1–2 px on hover with an accompanying shadow, giving tactile
  feedback without being distracting.
- **Buttons** (`.btn-primary`, `.btn-success`, `.btn-danger`) have a 1 px hover lift and press-down on `:active`.
- **Toasts** use `backdrop-filter: blur(14px) saturate(180%)` with a subtle 10 % border tint, and switched to the
  per-theme contrast tokens. Toast-warning and toast-info no longer fail to contrast in light mode.
- **Popup header** and **Queue / Settings page headers** are sticky with `backdrop-filter: blur(12px)
  saturate(180%)` against translucent backgrounds — gives a modern "frosted glass" feel while scrolling.
- **Scrollbar thumb** adapts in light mode.

### Fixed

- **WCAG AA regression** — `text-muted` was flagged at 3.6:1 on card backgrounds, below the 4.5:1 threshold for
  body text. Now 5.0:1.


### Fixed

- **Singleton-tab behaviour now works across tabs and windows.** The v1.5.0 implementation used
  `chrome.tabs.query({url: chrome.runtime.getURL(...)})` from the popup, which Chrome silently ignores when the
  extension lacks the `tabs` permission and has no matching host permission for `chrome-extension://` URLs. The URL
  filter was being dropped, an unrelated tab was being picked up, and the fallback opened a duplicate. Clicking
  **Queue** or **Settings** from any tab in any window now reliably focuses the existing tab.
- Secondary fix: removed the race between `openExtensionPage(...)` (async) and `window.close()` in the popup — the
  popup no longer relies on in-flight Chrome API calls completing after teardown.

### Changed

- **Tab registry moved to the service worker.** `background/sw.js` maintains a `Map<path, tabId>` of the extension
  tabs it has created. New `MSG.OPEN_EXTENSION_PAGE` delegates the open/focus decision to the sw.
  - sw creates the tab itself → knows the id without needing `chrome.tabs.query`
  - `chrome.tabs.onRemoved` listener drops stale entries
  - Reset Extension clears the registry alongside `detectedGames`
  - Stale id (onRemoved hasn't fired yet) gracefully falls through to a new `chrome.tabs.create`
- **Deleted** `shared/tab-manager.js` — the function now lives inside the sw.

### Permissions

No change — still only `storage` + `activeTab`.

---

## [1.6.0] - 2026-04-18

### Added

- **Push Selected** — each queue card now has a checkbox; the new *Push Selected (N)* button pushes only the checked
  entries. Leverages the existing `pushQueue({appids})` filter in `background/push-handler.js`. Selection state survives
  auto-refresh and is pruned to live entries after every re-render.
- **Scan Page** — a small *Scan* button inside the popup's detected-game card asks the active Steam tab's content
  script to re-run detection without a page reload. Picks up late-loading DOM (e.g. the language table, tags arriving
  after `document_idle`). No new manifest permissions — uses `chrome.tabs.sendMessage` to the existing content script.
  - `content/detector.js` orchestrator refactored: the scrape body lives in `SF2P.runDetection()`, invoked once at
    `document_idle` and again on `RESCAN_PAGE` messages.
  - `content/lib-dom.js` exposes `SF2P.clearDomCache()` which is called before every re-scan so cached selectors get
    re-queried.
- **Undo toast** for *Remove* and *Clear All* on the queue page. A new `showUndoToast(text, onUndo, opts)` in
  `shared/ui-helpers.js` renders an inline `[Undo]` button next to the text. Undo restores the entry(ies) verbatim via
  the new `MSG.RESTORE_ENTRY` path — original `added_at`, notes, and edited fields are preserved because
  `restoreEntry()` and `restoreEntries()` in `background/queue-manager.js` bypass `makeQueueEntry()` (which would
  otherwise regenerate the timestamp).
- `MSG.RESCAN_PAGE` and `MSG.RESTORE_ENTRY` added to `shared/constants.js`.

### Changed

- `queue/queue.js` — shared `runPush({appids, btn, originalHTML, onSuccess})` helper now powers both `pushAllBtn` and
  the new `pushSelectedBtn`, preserving the GPG fallback flow.
- `shared/theme.css` — styles for `.toast-undo` / `.toast-action` (the inline Undo button).
- `queue/queue.css` — styles for `.game-card-select` checkbox and `.is-selected` outline.

---

## [1.5.1] - 2026-04-18

### Added

- **CI/CD release automation** — new `.github/workflows/release.yml` triggers on any `v*.*.*` tag push. Verifies
  `manifest.json` version matches the tag, builds `steam-f2p-tracker-vX.Y.Z.zip` (excluding dev-only files), creates
  a GitHub release with the tag annotation as body, and uploads the ZIP as an asset. Signed tags are preserved with
  their "Verified" badge.

### Release flow

```bash
# Bump manifest.json version, merge to main, then:
git tag -s vX.Y.Z -m "release notes..."
git push origin vX.Y.Z   # workflow does the rest
```

---

## [1.5.0] - 2026-04-18

### Added

- **Singleton tabs** — new `shared/tab-manager.js` exporting `openExtensionPage(path)`. Clicking Queue or Settings in
  the popup now focuses any existing tab (via `chrome.tabs.query({url})` + `chrome.tabs.update` + `chrome.windows.update`)
  instead of piling up duplicates.
- **Auto-refresh via `chrome.storage.onChanged`**:
  - Queue page re-renders live (debounced 150 ms) when entries are added from the popup, removed by auto-push, or
    edited elsewhere.
  - Settings page reloads on settings / GPG-key changes, guarded by `isUserEditing()` so in-progress input is never
    clobbered.
  - Popup keeps the queue count and progress bar in sync while open.

### Changed

- **popup.js** — three `chrome.tabs.create(...)` sites replaced with `openExtensionPage()` (first-run setup, Queue
  button, Settings button).

---

## [1.4.0] - 2026-04-18

### Changed

- **Detector split** — the 820-line monolithic `content/detector.js` is broken into 9 content-script files sharing a
  `globalThis.SF2P` namespace:
  - `content/ns.js` — namespace init
  - `content/lib-dom.js` — `textOf`, `textsOf`, `hasCheck`, plus **cached selector getters** for `.app_tag`,
    `.dev_row`, breadcrumbs, and `#appHeaderGridContainer` (each was previously re-queried 2–4× per detection)
  - `content/extract-price.js` — schema.org + DOM price, paid-DLC scan
  - `content/extract-type.js` — `isDLCPage`, `isDemo`, `isPlaytest`, `classifyFreeType`
  - `content/extract-platform.js` — `detectOnlineOffline`, `extractPlatforms`
  - `content/extract-anticheat.js` — `ANTI_CHEAT_DB` + two-pass detection
  - `content/extract-metadata.js` — developer, publisher, release date, header image, name, genre, grid-layout helper
  - `content/extract-lang-tags.js` — language table + popular tags
  - `content/detector.js` — **orchestrator (149 lines, was 810)**, assembles `gameData`, dispatches `GAME_DETECTED`
- **manifest.json** `content_scripts.js` lists all 9 files in load order.

### Performance

- **Cached selectors** — frequently-used DOM queries are resolved once per page load and reused by all extract modules.
- **Early-return for DLC / demo / playtest** — the orchestrator now emits a minimal payload (name, header, genre,
  developer, type flags) and skips AC detection, language table, full tag scrape, publisher, release date, description,
  platforms. Saves ~40% scrape time on those page types. Safe because the popup blocks these from the queue anyway.

---

## [1.3.0] - 2026-04-18

### Added

- **Shared UI helpers** — new `shared/ui-helpers.js` exporting `$` (`document.querySelector`), `sendMessage`, and
  `showToast`. Previously duplicated across `popup.js`, `queue.js`, `settings.js`.

### Removed

- **Unused `alarms` manifest permission** — declared but never used (auto-push fires synchronously after each add).
- **Dead exports** (confirmed via grep, zero imports):
  - `OPTIONAL_FIELDS` (legacy alias of `EDITABLE_FIELDS`)
  - `CACHE_DATA_SHA`, `CACHE_TEMP_SHA` storage keys (abandoned caching strategy)
  - `getRecentLogs()` from `shared/logger.js`
  - `clearQueue()`, `getEntry()` from `background/queue-manager.js`

### Changed

- **queue.js** — push confirm dialog no longer references the deprecated `scripts/temp_info.jsonl` path in its wording.

---

## [1.2.1] - 2026-04-18

### Fixed

- **Language scraper** — rows Steam marks as "Not supported" (`<tr class="unsupported">` containing a single
  `<td colspan="3">Not supported</td>`) were bypassing the `cells.length < 2` header-skip guard and getting pushed
  with all flags `false`. `extractLanguages()` now:
  - Primary filter: skips any row with `classList.contains("unsupported")`
  - Defensive fallback: skips rows where none of interface / audio / subtitles have a checkmark

---

## [1.2.0] - 2026-04-18

### Changed

- **Multi-file dedup via `data/index.json`** — the dedup checker no longer reads a single `scripts/data.jsonl`.
  Instead it reads `data/index.json` (manifest describing all data files and their entry counts) and fetches every
  `data/data_NNN.jsonl` shard in parallel (`Promise.allSettled`). Falls back gracefully if the index is missing or an
  individual shard errors.
- **constants.js** — `REPO_DATA_PATH` removed; replaced with `REPO_INDEX_PATH = "data/index.json"` and
  `REPO_DATA_DIR = "data/"`. `REPO_TEMP_PATH` unchanged — push still targets `scripts/temp_info.jsonl`.

### Added

- `getRawFileContent()` in `github-api.js` — fetches large files (> 1 MB) directly from `raw.githubusercontent.com`,
  bypassing the Contents API's base64 size limit. Used as a fallback by the dedup checker.

---

## [1.1.0] - 2026-03-26

### Added

#### New Auto-Detected Fields

- **Description** extraction from `.game_description_snippet` with full description fallback
- **Developer** extraction rewritten — now returns `string[]` to support multiple developers; handles both `.dev_row`
  layout (single dev) and `#appHeaderGridContainer` grid layout (≥2 devs)
- **Publisher** extraction rewritten — same dual-layout support as developer, returns `string[]`
- **Release date** extraction — added fallback to `#appHeaderGridContainer` grid layout (`.grid_label` "Released")
- **Platform** detection from `.platform_img` classes — Windows, macOS, Linux, Steam Play, Steam Deck — with system
  requirements tab fallback
- **Language** table parsing from `#languageTable` — extracts per-language support matrix (interface, full audio,
  subtitles) and flat language name list
- **Full tag list** extraction from `.glance_tags.popular_tags a` — includes hidden overflow tags that Steam collapses
  by default
- **`extractFromGridLayout()` helper** — shared function for parsing Steam's `#appHeaderGridContainer` grid layout,
  used by developer, publisher, and release date extractors

#### Queue UI Redesign

- **Two-panel card layout** — each game card now has two separate collapsible sections:
  - **Game Info (auto-detected)** — read-only panel showing description, release date, developer, publisher, platforms,
    languages, and tags as styled chips
  - **Edit fields** — user-editable panel for genre, type, anti-cheat, notes, and safety rating
- **Genre tag-select dropdown** — replaces free-text genre input with a smart dropdown:
  - "From this game" group: tags detected from the current Steam page (prioritized)
  - "Common genres" group: 30 preset genres (Action, RPG, Strategy, etc.)
  - "Other (type custom)..." option: reveals a text input for custom genre entry
  - Automatically shows custom input when current genre doesn't match any list
- **Tag chips** in auto-detected panel — all Steam tags displayed as compact styled badges
- **Auto field protection** — auto-detected fields (description, release_date, developer, publisher, platforms,
  languages, tags, etc.) are locked and cannot be overwritten via the edit UI

#### Popup Enhancements

- **Extra info line** below game name showing platforms, language count, and publisher (when different from developer)
- **Description preview** — truncated game description shown in the detected game card

#### Push: Full Data Export

- `toTempEntry()` now serializes **all 20 fields** to JSONL — both auto-detected and user-edited
- Fields organized in 7 logical groups: Identity → Classification → Metadata → Anti-cheat → Supplementary →
  Annotations → Extension metadata
- Empty values, empty arrays, and defaults (e.g., `anti_cheat: "-"`) are omitted to keep JSONL compact
- New fields in push output: `description`, `publisher`, `platforms`, `languages`, `language_details`, `tags`,
  `free_type`, `anti_cheat_note`, `is_kernel_ac`, `added_at`

### Changed

- **detector.js** — rewritten with 5 new extractor functions + `extractFromGridLayout()` helper; `extractDeveloper()`
  and `extractPublisher()` now return `string[]` with dual-layout support (`.dev_row` for single, `#appHeaderGridContainer`
  for multiple); `extractReleaseDate()` added grid layout fallback; anti-cheat database expanded from 14 to 20 systems
  (added KSS, NetEase GS, Nexon GP, miHoYo AC, AhnLab, Wellbia)
- **constants.js** — `OPTIONAL_FIELDS` split into `AUTO_FIELDS` (read-only) and `EDITABLE_FIELDS` (user-modifiable);
  `developer` and `publisher` type changed from `"text"` to `"list"`; added `GENRE_PRESETS` (30 common genres);
  `OPTIONAL_FIELDS` kept as legacy alias
- **utils.js** — `makeQueueEntry()` now populates all new auto fields; `developer` and `publisher` default to `[]`
  instead of `""`
- **queue-manager.js** — `addToQueue()` merges all new auto fields; `updateEntry()` enforces field protection via
  `AUTO_LOCKED_FIELDS` set (12 fields) and `EDITABLE_FIELD_KEYS` set (5 fields); rejected fields logged at warn level
- **push-handler.js** — `toTempEntry()` rewritten to include full game data; `developer` and `publisher` arrays
  checked with `Array.isArray()` + `.length > 0` before inclusion
- **queue.css** — new styles for auto-detected panel, tag chips, genre dropdown, optgroup labels, two-toggle layout
- **popup.html** — added `#detectedExtraInfo` and `#detectedDesc` elements
- **popup.js** — renders extra info line and description preview; developer and publisher displayed via `Array.isArray()`
  check + `join(", ")`; publisher comparison against developer uses joined strings
- **queue.js** — complete rewrite of `createCard()` with dual-panel layout, `createGenreField()` tag-select builder;
  developer/publisher rendered as joined strings from arrays; search filter handles array fields

---

## [1.0.0] - 2026-03-25

### Added

#### Core Pipeline

- Auto-detect free-to-play games on Steam store pages via content script DOM parsing
- Schema.org structured data (`meta[itemprop="price"]`) as primary price source with DOM fallback
- Free type classification: `Free to Play`, `Free Game`, `Demo`, `Playtest`, `Paid`
- DLC page detection — automatically ignored (not base games)
- Paid DLC detection via `#gameAreaDLCSection` parsing with auto-note `Paid DLC`
- Online/Offline auto-detection from Steam category features (multiplayer, MMO, co-op, PvP)
- Anti-cheat detection with two-pass strategy: Steam structured `.anticheat_section` parsing (primary) with dictionary
  fallback (20 systems): VAC, EAC, BattlEye, Vanguard, PunkBuster, nProtect GameGuard, XIGNCODE, Ricochet, mHyprot,
  FACEIT AC, Denuvo AC, Zakynthos, Treyarch AC, Hyperion, KSS, NetEase GS, Nexon GP, miHoYo AC, AhnLab, Wellbia
- Kernel vs non-kernel anti-cheat classification from Steam structured data
- Multiple anti-cheat system detection (combined labels, e.g., "EAC + BattlEye")
- Auto-notes pipeline: DLC and anti-cheat info automatically added to queue entry notes
- Persistent game queue in `chrome.storage.local` with 150-entry cap
- Per-entry editable optional fields: type_game, anti_cheat, notes, safe, genre
- Remote deduplication against `data.jsonl` and `temp_info.jsonl` via GitHub Contents API
- Local queue dedup (instant, always fresh)
- Dedup cache with configurable TTL and manual refresh
- Push to GitHub via Contents API (append to `scripts/temp_info.jsonl`)
- SHA conflict detection with automatic retry (re-fetch + re-merge)
- Auto-push when queue reaches configurable threshold

#### GPG Signing (Optional)

- GPG key import with validation (format, expiry, algorithm support)
- Supports RSA, Ed25519, ECDSA, and other OpenPGP key types
- Key metadata display: fingerprint, algorithm, key ID, creation date, expire day, user ID
- Signed commits via Git Database API (create blob → tree → signed commit → update ref)
- Timestamp synchronization between signed payload and API call for GitHub verification
- Committer identity from GPG key UID (email must match for verified signature)
- Separate author vs committer in signed commits
- Fallback to unsigned push with user confirmation when signing fails
- Passphrase-protected key support (passphrase used only during import, never stored)

#### User Interface

- Popup: detected game card with thumbnail, name, genre, developer, free type badge
- Popup: queue summary bar with count, percentage fill, and color indicators
- Popup: recent activity log (last 5 entries)
- Popup: first-run setup banner when GitHub not configured
- Popup: connection status indicator (green dot = connected)
- Queue page: card grid with search/filter, staggered slide-in animations
- Queue page: expandable optional fields editor per game card
- Queue page: Clear All with confirmation dialog
- Queue page: keyboard shortcuts (`Ctrl+F` / `/` to search, `Escape` to clear)
- Settings page: GitHub connection config with test button
- Settings page: committer identity (name, email)
- Settings page: GPG toggle, key import/validate/remove, key info display
- Settings page: push settings (auto-push threshold, commit message prefix)
- Settings page: cache TTL config with manual refresh
- Settings page: log level and max entries config
- Settings page: log viewer with level/category filters
- Settings page: export logs as JSON, clear logs
- Settings page: Reset Extension with two-step confirmation (5s timeout)
- Toast notifications for all operations (success, error, warning, info)
- CSS design system with Steam-inspired dark theme and custom properties
- Section fade-in and card slide-in animations
- Spinner loading states on action buttons

#### Logging

- Structured log entries: timestamp, level, category, message, optional data
- Log levels: debug, info, warn, error (configurable minimum)
- Auto-pruning when max entries exceeded (FIFO)
- Export as JSON file with timestamped filename
- Categories: push, queue, dedup, gpg, settings, github, sw

#### Infrastructure

- Chrome Manifest V3 with ES module service worker
- Zero npm dependencies — vanilla JS (ES2022+) and CSS
- 26 files across 8 directories
- Static imports only (MV3 service worker compatible)
- `chrome.storage.local` for all persistent data
- Modular architecture: shared utilities, background modules, UI pages

### Dependencies

| Component  | Version | License  |
|------------|---------|----------|
| openpgp.js | 6.x     | LGPL-3.0 |

---

## [Unreleased]

### Planned / proposed

- **UI refresh Phase B (targeting v2.0.0)** — remaining items: in-app theme toggle (system / dark / light),
  toast stack with undo progress bar. (Themed modal shipped in v1.8.0; queue card redesign with tabs shipped in
  v1.9.0; skeleton loaders shipped in v1.10.0.)
- Firefox (Manifest V3) support
- Queue JSON export/import (backup / cross-browser migration)
- GitHub health indicator in popup (surface recent rate-limit / auth errors)
- Keyboard shortcuts via the `commands` API (`Ctrl+Shift+Q` queue, `Ctrl+Shift+,` settings)
- PR-time validation workflow (manifest parse, version-bump check, SPDX header check)
- Anti-cheat false-positive guards (word-boundary regex for short codes like `vac` / `eac`)

---

[1.0.0]: https://github.com/poli0981/steam-f2p-extension/releases/tag/v1.0.0
[1.1.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.0.0...v1.1.0
[1.2.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.1.0...v1.2.0
[1.2.1]: https://github.com/poli0981/steam-f2p-extension/compare/v1.2.0...v1.2.1
[1.3.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.2.1...v1.3.0
[1.4.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.3.0...v1.4.0
[1.5.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.4.0...v1.5.0
[1.5.1]: https://github.com/poli0981/steam-f2p-extension/compare/v1.5.0...v1.5.1
[1.6.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.5.1...v1.6.0
[1.6.1]: https://github.com/poli0981/steam-f2p-extension/compare/v1.6.0...v1.6.1
[1.7.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.6.1...v1.7.0
[1.8.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.7.0...v1.8.0
[1.9.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.8.0...v1.9.0
[1.10.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.9.0...v1.10.0
[Unreleased]: https://github.com/poli0981/steam-f2p-extension/compare/v1.10.0...HEAD