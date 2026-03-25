# 🎮 Steam F2P Tracker Extension

> Chrome extension that auto-detects free-to-play Steam games, queues them, and pushes to a GitHub tracker repository —
> with optional GPG-signed commits.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-brightgreen.svg)](#installation)
[![No Dependencies](https://img.shields.io/badge/Dependencies-0%20npm-orange.svg)](#architecture)

---

## What It Does

This extension sits in your browser toolbar while you browse the Steam store. When you visit a game page, it:

1. **Detects** game metadata — name, genre, price, developer, anti-cheat, online/offline status
2. **Classifies** the game — Free to Play, Free Game, Demo, Playtest, or Paid
3. **Checks for duplicates** against your GitHub tracker's existing data
4. **Queues** the game locally with editable optional fields
5. **Pushes** to `scripts/temp_info.jsonl` in your GitHub repository

The companion [free-steam-games-list](https://github.com/poli0981/free-steam-games-list) repository then ingests, validates, and
catalogs the games automatically via GitHub Actions.

---

## Features

### Detection

- **Price detection** via schema.org structured data with DOM fallback — base game price only, bundles excluded
- **Free type classification**: `Free to Play` (monetized), `Free Game` (fully free), `Demo`, `Playtest`, `Paid`
- **DLC detection** — paid DLC identified separately from base game via `#gameAreaDLCSection`
- **Online/Offline** auto-detection from Steam multiplayer/MMO/co-op categories
- **Anti-cheat** two-pass detection: Steam structured `.anticheat_section` (primary) + dictionary pattern scan (
  fallback) — 20 systems with kernel/non-kernel classification
- **Auto-notes**: DLC, anti-cheat name, and kernel level info added to queue entries automatically

### Queue Management

- Persistent local queue (up to 150 games) in `chrome.storage.local`
- Per-entry editable fields: type, anti-cheat, notes, safety rating, genre override
- Search and filter within queue
- Card grid UI with thumbnail previews
- Clear All with confirmation

### GitHub Integration

- Push to `scripts/temp_info.jsonl` via GitHub Contents API
- Remote deduplication against `data.jsonl` + `temp_info.jsonl`
- SHA conflict detection with automatic retry
- Auto-push when queue reaches configurable threshold
- Configurable commit message prefix

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
   # Download the real openpgp.js v6 ESM build
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

- **Detected game** card with thumbnail, name, genre, badges (Free to Play / Free Game / Paid / Demo / Playtest /
  Online / Anti-cheat)
- **Duplicate status** — "already in tracker" or "already in queue"
- **Queue summary** — count and progress bar
- **Quick actions** — Push, Open Queue, Open Settings
- **Recent activity** — last 5 log entries

### Queue Page

Open from popup → **Queue** button. Full-page management with:

- Card grid showing all queued games
- Click **▾ Edit optional fields** on any card to set type, anti-cheat, notes, safety, genre
- Search bar to filter by name, genre, or developer
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

## Architecture

```
steam-f2p-extension/          26 files · 211 KB · 0 npm dependencies
├── manifest.json             Extension config (MV3, ES modules)
├── background/               Service worker modules
│   ├── sw.js                 Entry point & message router
│   ├── github-api.js         GitHub REST + Git Database API client
│   ├── gpg-signer.js         GPG key management & commit signing
│   ├── dedup-checker.js      Remote + local deduplication
│   ├── push-handler.js       Push orchestrator (signed & unsigned)
│   └── queue-manager.js      Queue CRUD with cap enforcement
├── content/
│   └── detector.js           Steam page parser (price, DLC, anti-cheat)
├── popup/                    Toolbar popup (HTML + CSS + JS)
├── queue/                    Full-page queue manager
├── settings/                 Full-page settings
├── shared/                   Constants, storage, logger, utils, theme
├── lib/
│   └── openpgp.min.mjs       OpenPGP.js v6 (LGPL-3.0)
└── icons/                    Extension icons (16, 48, 128)
```

### Data Flow

```
Steam Store Page
       │
       ▼
 [Content Script]  ──  Extracts game metadata from DOM + schema.org
       │
       ▼
 [Service Worker]  ──  Validates, dedup checks (local + remote)
       │
       ▼
 [Queue Storage]   ──  chrome.storage.local (up to 150 entries)
       │
       ▼
 [Push Handler]    ──  Appends to temp_info.jsonl on GitHub
       │                (Contents API or signed Git Database API)
       ▼
 [GitHub Repo]     ──  CI/CD ingests, validates, catalogs
```

### Permissions

| Permission                          | Purpose                              |
|-------------------------------------|--------------------------------------|
| `storage`                           | Local queue, settings, logs, cache   |
| `activeTab`                         | Read current Steam tab for detection |
| `alarms`                            | Auto-push scheduling                 |
| `host: store.steampowered.com/*`    | Content script on Steam pages        |
| `host: api.github.com/*`            | Repository API calls                 |
| `host: raw.githubusercontent.com/*` | Raw file fetch for dedup             |

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

Anti-cheat info (full name + kernel level) is automatically added to queue entry notes. Multiple AC systems on the same
game are combined (e.g., `EAC + BattlEye`).

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

| Document                                      | Description                                         |
|-----------------------------------------------|-----------------------------------------------------|
| [LICENSE](LICENSE)                            | GPL-3.0-only                                        |
| [REQUIREMENTS](REQUIREMENTS.md)               | System requirements, tested environments, dev tools |
| [DISCLAIMER](DISCLAIMER.md)                   | Warranty disclaimers and warnings                   |
| [PRIVACY_POLICY](PRIVACY_POLICY.md)           | Data handling and privacy                           |
| [TERMS_OF_USE](TERMS_OF_USE.md)               | Terms of use / EULA                                 |
| [SECURITY](SECURITY.md)                       | Vulnerability reporting policy                      |
| [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md) | Third-party licenses                                |
| [CODE_OF_CONDUCT](CODE_OF_CONDUCT.md)         | Community standards                                 |
| [CONTRIBUTING](CONTRIBUTING.md)               | How to contribute                                   |
| [CHANGELOG](CHANGELOG.md)                     | Version history                                     |

---

## Acknowledgments

- [OpenPGP.js](https://github.com/openpgpjs/openpgpjs) — GPG signing library (LGPL-3.0)
- [Valve / Steam](https://store.steampowered.com) — Game store platform
- [GitHub API](https://docs.github.com/en/rest) — Repository hosting and API

---

## Disclaimer

This extension is provided **as-is** without warranty. It is not affiliated with Valve, Steam, or GitHub. Game
information extracted may not be 100% accurate. See [DISCLAIMER.md](DISCLAIMER.md) for full details.

---

<p align="center">
  <sub>Built with vanilla JS · Zero dependencies · Made for the community</sub>
</p>
