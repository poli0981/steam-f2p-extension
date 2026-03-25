# Privacy Policy

**Last updated:** March 2026  
**Applies to:** Steam F2P Tracker Extension (Chrome/Chromium)

---

## Overview

The Steam F2P Tracker Extension ("the Extension") is committed to protecting your privacy. This Extension operates *
*entirely on your local machine** and does not collect, transmit, or store any personal data on external servers
controlled by the developer.

---

## Data We Do NOT Collect

The Extension does **not** collect, store, or transmit any of the following:

- Personal identifying information (name, email address, phone number, etc.)
- Browsing history or browsing habits
- Device identifiers or fingerprints
- Location data
- Analytics, telemetry, or usage statistics
- Cookies or tracking data

**There is no analytics service, tracking pixel, or telemetry endpoint in this Extension.**

---

## Data Stored Locally

The Extension uses `chrome.storage.local` (browser-provided local storage) to persist the following data **on your
device only**:

| Data                                         | Purpose                                                     | Shared With                                  |
|----------------------------------------------|-------------------------------------------------------------|----------------------------------------------|
| GitHub Personal Access Token                 | Authenticate with GitHub API to read/write repository files | `api.github.com` only                        |
| GitHub repository info (owner, repo, branch) | Identify target repository for push operations              | `api.github.com` only                        |
| Committer name and email                     | Set as commit author/committer identity                     | `api.github.com` only                        |
| GPG private key (if imported)                | Sign commits (optional feature)                             | Never transmitted — used locally for signing |
| Game queue (detected game metadata)          | Store pending games before push                             | `api.github.com` when pushed                 |
| Extension logs                               | Debugging and activity history                              | Never transmitted                            |
| Cached appid lists                           | Deduplication checks                                        | Never transmitted                            |

### Important Notes

- **Your GitHub token** is sent only to `api.github.com` as an `Authorization` header. It is never sent to any other
  server.
- **Your GPG private key** is never transmitted over the network. It is used locally to create detached signatures, and
  only the resulting signature (not the key) is sent to GitHub.
- **Committer name and email** are included in Git commits pushed to your repository. These become part of the public
  Git history if your repository is public.

---

## Data Transmitted to Third Parties

The Extension communicates with exactly two external services:

### 1. Steam Store (`store.steampowered.com`)

- **What:** The Extension's content script reads the DOM of Steam store pages you visit to extract game metadata (name,
  price, genre, etc.).
- **How:** Standard page reading — no additional HTTP requests are made to Steam servers by the Extension. The content
  script reads the page that your browser has already loaded.
- **Privacy policy:** [Steam Privacy Policy](https://store.steampowered.com/privacy_agreement/)

### 2. GitHub API (`api.github.com`)

- **What:** The Extension reads and writes files in your specified GitHub repository using the GitHub REST API.
- **Authentication:** Your Personal Access Token is sent as a Bearer token in the `Authorization` header.
- **Data sent:** Game metadata (links, names, genres, etc.) as JSONL content, commit messages, and optionally GPG
  signatures.
- **Privacy policy:
  ** [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)

**No data is sent to any server controlled by the Extension developer.**

---

## Permissions Explained

| Permission                          | Why It's Needed                                                  |
|-------------------------------------|------------------------------------------------------------------|
| `storage`                           | Store settings, queue, logs, and cached data locally             |
| `activeTab`                         | Read the current Steam store tab to detect game information      |
| `alarms`                            | Schedule auto-push checks (if auto-push threshold is configured) |
| Host: `store.steampowered.com/*`    | Content script runs on Steam store pages to extract game data    |
| Host: `api.github.com/*`            | API calls to read/write repository files                         |
| Host: `raw.githubusercontent.com/*` | Fetch raw file content for deduplication checks                  |

---

## Data Retention

- All data is stored in `chrome.storage.local` and persists until you manually clear it, reset the Extension, or
  uninstall it.
- Uninstalling the Extension removes all locally stored data.
- The "Reset Extension" feature in Settings clears all stored data (settings, queue, logs, keys, cache).
- Logs are automatically pruned when they exceed the configured maximum (default: 500 entries).

---

## Data You Push to GitHub

When you push games to your GitHub repository, the game metadata becomes part of your repository's Git history. If your
repository is **public**, this data is publicly accessible. This includes:

- Game links, names, genres, and other metadata
- Commit messages with timestamps
- Committer name and email
- GPG signatures (if enabled)

**You are responsible for the content you push to your repository.**

---

## Children's Privacy

This Extension is not directed at children under the age of 13. We do not knowingly collect any information from
children.

---

## Changes to This Policy

This privacy policy may be updated to reflect changes in the Extension's functionality. Changes will be documented in
the repository's commit history. Continued use after changes constitutes acceptance.

---

## Contact

If you have questions about this privacy policy,
please [open an issue](https://github.com/poli0981/steam-f2p-extension/issues) on the repository.
