# System Requirements & Environment

This document describes the system requirements to use the Steam F2P Tracker Extension, the environments it has been
tested on, and the tools used during development.

---

## Requirements

### Minimum

| Component      | Requirement                                                                                                                                                              |
|----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Browser**    | Any Chromium-based browser supporting Manifest V3 (Chrome 110+, Edge 110+, Brave 1.50+, Vivaldi 6.0+, Opera 96+)                                                         |
| **OS**         | Windows 10 (64-bit), macOS 12 Monterey, or Linux with a supported Chromium browser                                                                                       |
| **RAM**        | 4 GB (browser + extension overhead)                                                                                                                                      |
| **Disk**       | ~5 MB (extension files + local storage)                                                                                                                                  |
| **Network**    | Internet connection (required for Steam page access and GitHub API calls)                                                                                                |
| **GitHub**     | GitHub account with a [Personal Access Token](https://github.com/settings/tokens/new) (`repo` scope)                                                                     |
| **Repository** | A GitHub repository following the [free-steam-games-list](https://github.com/poli0981/free-steam-games-list) structure: `data/index.json` manifest, `data/data_NNN.jsonl` shards, and `scripts/temp_info.jsonl` push target |

### Recommended

| Component        | Recommendation                                                                                      |
|------------------|-----------------------------------------------------------------------------------------------------|
| **Browser**      | Google Chrome 120+ or Brave 1.70+ (latest stable or beta channel)                                   |
| **OS**           | Windows 11 (64-bit), macOS 14+ Sonoma, or Ubuntu 22.04+                                             |
| **RAM**          | 8 GB+ (comfortable headroom for browser with multiple tabs)                                         |
| **Network**      | Stable broadband connection (GitHub API and Steam store page loading benefit from low latency)      |
| **GitHub Token** | Fine-grained PAT with minimal permissions: `Contents: Read and write` on the target repository only |
| **GPG Key**      | Ed25519 or RSA-4096 key registered in your GitHub account (for signed commits)                      |

### Optional

| Component         | Purpose                                                                                                                                         |
|-------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| **OpenPGP.js v6** | Required only if using GPG commit signing. Replace `lib/openpgp.min.mjs` with the [real build](https://unpkg.com/openpgp/dist/openpgp.min.mjs). |
| **Git CLI**       | Not required for the extension itself, but useful for repository management and verifying signed commits locally.                               |

---

## Tested Environments

The extension has been developed and tested by the maintainer in the following environments:

### Operating Systems

| OS      | Version     | Status   |
|---------|-------------|----------|
| Windows | 11 (64-bit) | ✅ Tested |
| macOS   | 26.x        | ✅ Tested |

### Browsers

| Browser              | Version               | Engine                  | Status   |
|----------------------|-----------------------|-------------------------|----------|
| Google Chrome Canary | 148.0.7753.0 (64-bit) | Chromium 148            | ✅ Tested |
| Brave                | 1.88.136              | Chromium 146.9.7680.164 | ✅ Tested |

> **Note:** The extension should work on any Chromium-based browser that supports Manifest V3 with ES module service
> workers. However, only the browsers listed above have been explicitly tested. If you encounter issues on other
> browsers,
> please [open an issue](https://github.com/poli0981/steam-f2p-extension/issues).

### Not Supported

| Browser               | Reason                                                                                                                                                                           |
|-----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Firefox               | Uses a different extension API model. MV3 support in Firefox is evolving but not yet compatible with this extension's service worker module setup. Planned for a future release. |
| Safari                | WebExtensions API differences. Not tested or supported.                                                                                                                          |
| Non-Chromium browsers | Incompatible extension APIs.                                                                                                                                                     |

---

## Development Environment

The following tools were used to develop, test, and document this project:

### IDE

| Tool               | Version  |
|--------------------|----------|
| JetBrains WebStorm | 2025.3.4 |

### AI Assistance

| Tool                        | Purpose                                                                |
|-----------------------------|------------------------------------------------------------------------|
| Claude Opus 4.6 (Anthropic) | Architecture design, code implementation, debugging, and documentation |

### Source Control & Hosting

| Platform | Purpose                                              |
|----------|------------------------------------------------------|
| GitHub   | Source code hosting, issue tracking, CI/CD workflows |
| Git      | Version control                                      |

### Languages & Standards

| Technology        | Details                                            |
|-------------------|----------------------------------------------------|
| JavaScript        | ES2022+ (vanilla, no transpilation, no build step) |
| CSS               | Custom Properties, no preprocessors                |
| HTML              | HTML5                                              |
| Chrome Extensions | Manifest V3 with ES module service worker          |

---

## Browser Compatibility Notes

### Manifest V3 Requirements

The extension relies on the following MV3 features that must be supported by the browser:

- `"type": "module"` in service worker declaration (ES module imports)
- `chrome.storage.local` API + `chrome.storage.onChanged` events (live refresh of queue/settings)
- `chrome.runtime.sendMessage` / `onMessage` with async response pattern
- `chrome.tabs.query` / `chrome.tabs.update` / `chrome.windows.update` (singleton queue & settings tabs)
- `chrome.tabs.sendMessage` (popup → content script, used by the Scan Page re-scrape feature)
- `chrome.action` API (badge text, popup)
- Content scripts with `"run_at": "document_idle"` — multi-file content script list (9 files load in order, shared `globalThis.SF2P` namespace)

### Known Browser Differences

| Feature          | Chrome | Brave | Notes                                                                                |
|------------------|--------|-------|--------------------------------------------------------------------------------------|
| Extension badge  | ✅      | ✅     | Badge count displays on extension icon                                               |
| Content script   | ✅      | ✅     | Brave Shields may interfere; disable for `store.steampowered.com` if detection fails |
| GitHub API calls | ✅      | ✅     | Brave Shields does not block `api.github.com` by default                             |
| GPG signing      | ✅      | ✅     | Requires real `openpgp.min.mjs` (not the placeholder)                                |

---

## Network Requirements

The extension makes requests to the following domains:

| Domain                      | Protocol | Purpose                                | Required                        |
|-----------------------------|----------|----------------------------------------|---------------------------------|
| `store.steampowered.com`    | HTTPS    | Content script reads Steam store pages | Yes                             |
| `api.github.com`            | HTTPS    | Contents API, Git Database API         | Yes                             |
| `raw.githubusercontent.com` | HTTPS    | Raw file fetch for dedup cache         | Optional (improves dedup speed) |

### Firewall / Proxy Notes

If you are behind a corporate firewall or proxy:

- Ensure `api.github.com` and `store.steampowered.com` are not blocked
- The extension does not support proxy authentication — API calls go through the browser's default network stack
- CORS is not an issue since the extension uses `host_permissions` for these domains

---

## Storage Usage

Estimated `chrome.storage.local` usage:

| Data                | Typical Size | Maximum               |
|---------------------|--------------|-----------------------|
| Settings            | ~1 KB        | ~2 KB                 |
| Queue (150 entries) | ~50 KB       | ~100 KB               |
| Logs (500 entries)  | ~150 KB      | ~300 KB               |
| Dedup cache         | ~100 KB      | ~500 KB (large repos) |
| GPG key material    | ~5 KB        | ~15 KB                |
| **Total**           | **~300 KB**  | **~1 MB**             |

Chrome's default `chrome.storage.local` quota is 5 MB (10 MB with `unlimitedStorage` permission, which this extension
does not request). Usage is well within limits.
