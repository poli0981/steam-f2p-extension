# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

### Planned

- Firefox (Manifest V3) support
- Push selected games (checkbox selection in queue)
- Import games from Steam curator list URL
- Batch detection across Steam tag/search pages
- Queue export/import (JSON backup)

---

[1.0.0]: https://github.com/poli0981/steam-f2p-extension/releases/tag/v1.0.0

[1.1.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.0.0...v1.1.0

[Unreleased]: https://github.com/poli0981/steam-f2p-extension/compare/v1.1.0...HEAD