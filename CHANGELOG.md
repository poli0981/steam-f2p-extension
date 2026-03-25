# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[Unreleased]: https://github.com/poli0981/steam-f2p-extension/compare/v1.0.0...HEAD
