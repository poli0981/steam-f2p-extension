# 🎮 Steam F2P Tracker Extension

> Chrome extension that auto-detects free-to-play Steam games, queues them, and pushes to a GitHub tracker repository —
> with optional GPG-signed commits.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-brightgreen.svg)](#installation)
[![No Dependencies](https://img.shields.io/badge/Dependencies-0%20npm-orange.svg)](#architecture)

---

## What It Does

This extension sits in your browser toolbar while you browse the Steam store. When you visit a game page, it:

1. **Detects** game metadata — name, genre, price, developer, publisher, description, platforms, languages, tags,
   anti-cheat, online/offline status
2. **Classifies** the game — Free to Play, Free Game, Demo, Playtest, or Paid
3. **Checks for duplicates** against your GitHub tracker's existing data (via `data/index.json` manifest)
4. **Queues** the game locally with auto-detected info (read-only) and editable fields
5. **Pushes** the full game data to `scripts/temp_info.jsonl` in your GitHub repository

The companion [free-steam-games-list](https://github.com/poli0981/free-steam-games-list) repository then ingests,
validates, and catalogs the games automatically via GitHub Actions.

---

## Features

### Detection

- **Price detection** via schema.org structured data with DOM fallback — base game price only, bundles excluded
- **Free type classification**: `Free to Play` (monetized), `Free Game` (fully free), `Demo`, `Playtest`, `Paid`
- **DLC detection** — paid DLC identified separately from base game via `#gameAreaDLCSection`
- **Online/Offline** auto-detection from Steam multiplayer/MMO/co-op categories
- **Anti-cheat** two-pass detection: Steam structured `.anticheat_section` (primary) + dictionary pattern scan (
  fallback) — 20 systems with kernel/non-kernel classification
- **Description** extraction from game snippet with full description fallback
- **Developer** extraction — supports single (`.dev_row`) and multiple (`#appHeaderGridContainer` grid layout)
  developers, stored as array
- **Publisher** extraction — same dual-layout support as developer, stored as array
- **Platform** detection — Windows, macOS, Linux, Steam Play, Steam Deck
- **Language** table parsing — per-language support matrix (interface, full audio, subtitles)
- **Full tag list** — all user-defined tags including hidden overflow tags
- **Auto-notes**: DLC, anti-cheat name, and kernel level info added to queue entries automatically

### Queue Management

- Persistent local queue (up to 150 games) in `chrome.storage.local`
- **Two-panel card layout**: auto-detected info (read-only) + editable fields (separate collapsible sections)
- **Genre tag-select dropdown**: tags from detected game → common genre presets → custom text input
- **Auto field protection**: 12 auto-detected fields locked from user edits
- Editable fields: type, anti-cheat, genre, notes, safety rating
- Search and filter within queue (searches name, genre, developer, publisher, tags)
- **Push Selected** — check any subset of cards and push only those; full queue push also available
- **Undo** transient toast after *Remove* / *Clear All* — restores the entry verbatim (original `added_at`, notes, edited fields preserved)
- Card grid UI with thumbnail previews
- Clear All with Undo window

### GitHub Integration

- **Full data push** — all 20 fields serialized to JSONL (auto-detected + user-edited)
- Push to `scripts/temp_info.jsonl` via GitHub Contents API
- Remote deduplication via `data/index.json` manifest — fetches all `data/data_NNN.jsonl` shards in parallel plus `scripts/temp_info.jsonl` for pending entries
- Large-file fallback (>1 MB) through `raw.githubusercontent.com`
- SHA conflict detection with automatic retry
- Auto-push when queue reaches configurable threshold
- Configurable commit message prefix
- **CI-automated releases** — pushing a `vX.Y.Z` tag builds the ZIP and publishes a GitHub release via `.github/workflows/release.yml`

### GPG Signing (Optional)

- Import and validate GPG private keys (RSA, Ed25519, ECDSA)
- Signed commits via Git Database API
- Committer identity from GPG key UID for GitHub verified signatures
- Fallback to unsigned push with user confirmation
- Key metadata display (fingerprint, algorithm, expiry)

### Logging

- Structured logs with levels (debug/info/warn/error) and categories
- Export as JSON file
- In-app log viewer with filters

---

## Installation

### Prerequisites

- Chrome or Chromium-based browser (Edge, Brave, Vivaldi, etc.)
- A GitHub repository with the [free-steam-games-list](https://github.com/poli0981/free-steam-games-list) structure
- A GitHub [Personal Access Token](https://github.com/settings/tokens/new) with `repo` scope

### Install from Source

1. **Download** or clone this repository:
   ```bash
   git clone https://github.com/poli0981/steam-f2p-extension.git
   ```

2. **(Optional) Replace the OpenPGP.js placeholder** if you want GPG signing:
   ```bash
   curl -o lib/openpgp.min.mjs https://unpkg.com/openpgp/dist/openpgp.min.mjs
   ```

3. **Load in Chrome:**
   - Navigate to `chrome://extensions`
   - Enable **Developer mode** (top right toggle)
   - Click **Load unpacked**
   - Select the `steam-f2p-extension` directory

4. **Configure:**
   - Click the extension icon → **Settings**
   - Enter your GitHub **Owner**, **Repository**, **Branch**, and **Token**
   - Click **Test Connection** to verify
   - (Optional) Configure committer identity, GPG signing, auto-push threshold

---

## Usage

### Basic Workflow

1. Browse to any Steam store game page
2. Click the extension icon — the popup shows detected game info with classification badges
3. Click **Add to Queue** (disabled for paid games, demos, playtests, and DLC pages)
4. Repeat for more games
5. Click **Push** to send all queued games to your GitHub repository

### Popup

The toolbar popup shows:

- **Detected game** card with thumbnail, name, genre, developer, platforms, language count, description preview
- **Classification badges**: Free to Play / Free Game / Paid / Demo / Playtest / Online / Anti-cheat (with kernel
  warning)
- **Scan button** — re-scrape the current page without reloading it (picks up late-loading DOM like the language table)
- **Duplicate status** — "already in tracker" or "already in queue"
- **Queue summary** — count and progress bar
- **Quick actions** — Push, Open Queue, Open Settings
- **Recent activity** — last 5 log entries

### Queue Page

Open from popup → **Queue** button. Full-page management with:

- Card grid showing all queued games with thumbnails
- **▾ Game Info (auto-detected)** — collapsible read-only panel: description, release date, developer, publisher,
  platforms, languages, tags (as chips)
- **▾ Edit fields** — collapsible editable panel: genre (tag-select dropdown), type, anti-cheat, notes, safety
- Search bar to filter by name, genre, developer, publisher, or tags
- **Push All** / **Clear All** actions
- Keyboard: `Ctrl+F` or `/` to search, `Escape` to clear

### Settings Page

Open from popup → **Settings** button. Sections:

- **GitHub Connection** — owner, repo, branch, token (with test button)
- **Committer Identity** — name and email for commits
- **GPG Signing** — toggle, key import, validation, metadata display
- **Push Settings** — auto-push threshold, commit prefix
- **Cache** — TTL for dedup cache, manual refresh
- **Logging** — level, max entries, viewer with filters, export, clear
- **Danger Zone** — Reset Extension (two-step confirmation)

---

## Push Data Format

Each game is pushed as a single JSONL line to `temp_info.jsonl` containing all detected and user-edited data. Empty
values and defaults are omitted for compactness.

```jsonc
{
  // Identity
  "link": "https://store.steampowered.com/app/4301370/",
  "name": "Linsips",
  // Classification
  "genre": "Action",
  "type_game": "offline",
  "free_type": "f2p",
  // Auto-detected metadata
  "developer": ["MILQ Games"],
  "publisher": ["MILQ Games"],
  "release_date": "18 Mar, 2026",
  "description": "A retro puzzle-action game...",
  "header_image": "https://shared.akamai.steamstatic.com/...",
  // Anti-cheat (if detected)
  "anti_cheat": "EAC",
  "anti_cheat_note": "Easy Anti-Cheat [Non-Kernel]",
  "is_kernel_ac": false,
  // Supplementary
  "platforms": ["Windows", "Linux"],
  "languages": ["English", "Japanese", "Simplified Chinese"],
  "language_details": [
    {"name": "English", "interface": true, "audio": false, "subtitles": false}
  ],
  "tags": ["Action", "Puzzle", "2D", "Pixel Graphics", "Free to Play"],
  // User annotations
  "notes": "Có DLC trả phí",
  "safe": "yes",
  // Metadata
  "added_at": "2026-03-26T12:00:00Z"
}
```

Multi-developer example:

```jsonc
{
  "developer": ["DONTNOD Entertainment", "Feral Interactive (Mac)", "Feral Interactive (Linux)"],
  "publisher": ["Square Enix", "Feral interactive (Mac)", "Feral Interactive (Linux)"]
}
```

---

## Architecture

```
steam-f2p-extension/          33 runtime files · 0 npm dependencies
├── manifest.json             Extension config (MV3, ES modules)
├── background/               Service worker modules
│   ├── sw.js                 Entry point & message router
│   ├── github-api.js         GitHub REST + Git Database API client
│   ├── gpg-signer.js         GPG key management & commit signing
│   ├── dedup-checker.js      index.json-driven multi-file deduplication
│   ├── push-handler.js       Push orchestrator (signed & unsigned)
│   └── queue-manager.js      Queue CRUD with cap + field protection
├── content/                  Steam page scraper — namespace + 7 extractors + orchestrator
│   ├── ns.js                 globalThis.SF2P namespace init
│   ├── lib-dom.js            DOM helpers + cached selectors
│   ├── extract-price.js      schema.org + DOM price, paid-DLC scan
│   ├── extract-type.js       DLC / demo / playtest / free-type
│   ├── extract-platform.js   online/offline + OS platforms
│   ├── extract-anticheat.js  20-system two-pass AC detection
│   ├── extract-metadata.js   developer / publisher / release / name / genre
│   ├── extract-lang-tags.js  languages table + popular tags
│   └── detector.js           Orchestrator (assembles gameData, sends message)
├── popup/                    Toolbar popup (HTML + CSS + JS)
├── queue/                    Full-page queue manager (dual-panel cards, live-refresh)
├── settings/                 Full-page settings (live-refresh, focus-aware)
├── shared/                   Constants, storage, logger, utils, theme,
│                             ui-helpers ($/sendMessage/showToast),
│                             tab-manager (singleton tabs)
├── lib/
│   └── openpgp.min.mjs       OpenPGP.js v6 (LGPL-3.0)
├── icons/                    Extension icons (16, 48, 128)
└── .github/workflows/
    └── release.yml           Tag-push → build ZIP → GitHub release
```

### Data Flow

```
Steam Store Page
       │
       ▼
 [Content Scripts] ──  Namespace (ns.js) + cached DOM helpers (lib-dom.js) +
       │               6 extractor modules sharing globalThis.SF2P.
       │               Orchestrator (detector.js) assembles and dispatches.
       │               Fast path on DLC/demo/playtest skips AC + language
       │               + tag extraction (~40% time saved).
       ▼
 [Service Worker]  ──  Validates F2P, dedup via data/index.json manifest,
       │               merges auto fields + auto-notes.
       │               chrome.storage.onChanged broadcasts updates to any
       │               open queue/settings/popup page.
       ▼
 [Queue Storage]   ──  chrome.storage.local (up to 150 entries).
       │               Auto fields: read-only (12 fields, arrays for dev/pub).
       │               Editable fields: genre, type, AC, notes, safe.
       ▼
 [Push Handler]    ──  Serializes full entry (20 fields) to JSONL.
       │               developer/publisher as arrays in output.
       │               Appends to scripts/temp_info.jsonl on GitHub
       │               (Contents API or signed Git Database API).
       ▼
 [GitHub Repo]     ──  CI/CD ingests, validates, catalogs into
                       data/data_NNN.jsonl shards, updates data/index.json.
```

### Permissions

| Permission                          | Purpose                              |
|-------------------------------------|--------------------------------------|
| `storage`                           | Local queue, settings, logs, cache   |
| `activeTab`                         | Read current Steam tab for detection |
| `host: store.steampowered.com/*`    | Content script on Steam pages        |
| `host: api.github.com/*`            | Repository API calls                 |
| `host: raw.githubusercontent.com/*` | Raw file fetch for dedup (>1 MB)     |

---

## Anti-Cheat Detection

The extension uses a **two-pass detection strategy**:

**Pass 1 — Steam Structured Data** (primary, most accurate):  
Steam pages with anti-cheat display structured `.anticheat_section` elements that include the official AC name and
kernel/non-kernel classification. The extension parses these directly.

**Pass 2 — Dictionary Pattern Scan** (fallback):  
For pages without structured AC sections, the extension scans categories, DRM notices, EULA, system requirements, and
description text against a dictionary of known patterns.

### Supported Anti-Cheat Systems (20)

| Label       | Full Name                         | Kernel Level |
|-------------|-----------------------------------|:------------:|
| VAC         | Valve Anti-Cheat                  |      No      |
| EAC         | Easy Anti-Cheat                   |     Yes      |
| BattlEye    | BattlEye Anti-Cheat               |     Yes      |
| Vanguard    | Riot Vanguard                     |     Yes      |
| PunkBuster  | PunkBuster (Even Balance)         |      No      |
| nProtect    | nProtect GameGuard                |     Yes      |
| XIGNCODE    | XIGNCODE3                         |     Yes      |
| Ricochet    | Ricochet (Activision)             |     Yes      |
| mHyprot     | mhyprot / HoYoverse               |     Yes      |
| FACEIT AC   | FACEIT Anti-Cheat                 |     Yes      |
| Denuvo AC   | Denuvo Anti-Cheat                 |     Yes      |
| Zakynthos   | Zakynthos (Ubisoft)               |      No      |
| Treyarch AC | Treyarch Anti-Cheat               |      No      |
| Hyperion    | Byfron Hyperion                   |     Yes      |
| KSS         | Krafton Security Services         |     Yes      |
| NetEase GS  | NetEase Game Security             |    Varies    |
| Nexon GP    | Nexon Game Security / Game Police |    Varies    |
| miHoYo AC   | miHoYo / HoYoverse Anti-Cheat     |     Yes      |
| AhnLab      | AhnLab HackShield                 |     Yes      |
| Wellbia     | Wellbia XHUNTER                   |     Yes      |

> **Note:** Kernel level classification shown above is typical but may vary by game. When detected via Steam's
> structured section, the actual kernel/non-kernel classification from the page is used. The popup displays kernel-level
> AC with a red `⚠ Kernel` badge.

---

## Configuration Reference

| Setting             | Default      | Description                        |
|---------------------|--------------|------------------------------------|
| GitHub Owner        | *(required)* | Repository owner (username or org) |
| GitHub Repo         | *(required)* | Repository name                    |
| GitHub Branch       | `main`       | Target branch                      |
| GitHub Token        | *(required)* | PAT with `repo` scope              |
| Committer Name      | *(empty)*    | Git commit author name             |
| Committer Email     | *(empty)*    | Git commit author email            |
| GPG Signing         | `disabled`   | Enable GPG-signed commits          |
| Auto-Push Threshold | `0` (off)    | Auto-push when queue reaches N     |
| Commit Prefix       | `ext:`       | Prefix for commit messages         |
| Cache TTL           | `5` min      | Dedup cache refresh interval       |
| Log Level           | `info`       | Minimum log level to store         |
| Max Log Entries     | `500`        | Auto-prune oldest when exceeded    |

---

## Legal & Policies

| Document                                           | Description                                         |
|----------------------------------------------------|-----------------------------------------------------|
| [LICENSE](LICENSE)                                 | GPL-3.0-only                                        |
| [REQUIREMENTS](REQUIREMENTS.md)                    | System requirements, tested environments, dev tools |
| [DISCLAIMER](docs/DISCLAIMER.md)                   | Warranty disclaimers and warnings                   |
| [PRIVACY_POLICY](docs/PRIVACY_POLICY.md)           | Data handling and privacy                           |
| [TERMS_OF_USE](docs/TERMS_OF_USE.md)               | Terms of use / EULA                                 |
| [SECURITY](SECURITY.md)                            | Vulnerability reporting policy                      |
| [THIRD_PARTY_NOTICES](docs/THIRD_PARTY_NOTICES.md) | Third-party licenses                                |
| [CODE_OF_CONDUCT](CODE_OF_CONDUCT.md)              | Community standards                                 |
| [CONTRIBUTING](CONTRIBUTING.md)                    | How to contribute                                   |
| [CHANGELOG](CHANGELOG.md)                          | Version history                                     |

---

## Acknowledgments

- [OpenPGP.js](https://github.com/openpgpjs/openpgpjs) — GPG signing library (LGPL-3.0)
- [Valve / Steam](https://store.steampowered.com) — Game store platform
- [GitHub API](https://docs.github.com/en/rest) — Repository hosting and API

---

## Disclaimer

This extension is provided **as-is** without warranty. It is not affiliated with Valve, Steam, or GitHub. Game
information extracted may not be 100% accurate. See [DISCLAIMER.md](docs/DISCLAIMER.md) for full details.

---

<p align="center">
  <sub>Built with vanilla JS · Zero dependencies · Made for the community</sub>
</p>