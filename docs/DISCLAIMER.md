# Disclaimer & Warnings

**Last updated:** April 2026 (v1.5.1)

This document outlines important disclaimers and warnings regarding the use of the **Steam F2P Tracker Extension** ("the
Extension"). By installing or using this Extension, you acknowledge that you have read and understood the following.

---

## No Warranty

This Extension is provided **"AS IS"** and **"AS AVAILABLE"**, without warranty of any kind, express or implied,
including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.
The entire risk as to the quality and performance of the Extension is with you.

## Independent Development

This Extension is developed and maintained by an **independent developer** with the assistance of AI tools. It is not
affiliated with, endorsed by, or sponsored by Valve Corporation (Steam), GitHub Inc., or any game developer or
publisher.

The codebase may contain bugs, errors, or unintended behaviors that have not been identified or addressed. No guarantee
is made that the Extension will function correctly in all environments or scenarios.

## Game Information Accuracy

- The Extension extracts game metadata (name, genre, pricing, anti-cheat, DLC status, etc.) by parsing Steam store page
  DOM and structured data. **This information may not be 100% accurate**, complete, or up-to-date.
- Free-to-play status detection relies on heuristics and may produce false positives or false negatives. A game detected
  as "free" may have changed its pricing model, or a paid game may be temporarily free.
- **No guarantee is made regarding the quality, safety, content, or suitability of any game** tracked by this Extension.
  The Extension merely detects and records metadata — it does not review, endorse, or recommend any game.
- Anti-cheat detection is based on pattern matching against known anti-cheat system names found on Steam store pages.
  Detection may be incomplete or inaccurate.

## Companion Tool

This Extension is designed as a companion tool for the [free-steam-games-list](https://github.com/poli0981/free-steam-games-list)
repository. It pushes data to `scripts/temp_info.jsonl` via the GitHub Contents API and reads existing entries for
deduplication via the `data/index.json` manifest.

- **You may need to modify the Extension** if you intend to use it with a different repository structure or workflow.
- The Extension assumes a specific repository layout:
  - `data/index.json` — manifest listing all data shards and their entry counts
  - `data/data_NNN.jsonl` — data shards (up to 800 entries each per `max_per_file`)
  - `scripts/temp_info.jsonl` — push target, appended to by the extension

  It may not function correctly with other configurations.

## Steam Store Links

- The Extension processes URLs from `store.steampowered.com`. While Steam is a legitimate platform, **no guarantee is
  made that all Steam store links are safe** or that linked content is appropriate for all audiences.
- The Extension does not verify the legitimacy or safety of individual game pages beyond basic URL format validation.
- Some games may be delisted, region-locked, or unavailable in your region after being detected.

## GitHub API & Authentication

- The Extension requires a GitHub **Personal Access Token** (PAT) with `repo` scope to function. This token is stored
  locally in your browser's extension storage.
- **You are solely responsible for the security of your GitHub token.** The Extension does not transmit your token to
  any server other than `api.github.com`.
- API rate limits, authentication failures, or changes to the GitHub API may cause the Extension to malfunction.
- Commits made by the Extension to your repository are your responsibility. Ensure you understand what data is being
  pushed before initiating a push operation.

## GPG Signing

- GPG signing is an optional feature. If enabled, the Extension signs commits using a private key stored locally in your
  browser.
- **You are responsible for the security of your GPG private key.** The Extension stores key material in
  `chrome.storage.local`, which is not encrypted by default beyond what the browser provides.
- Signature verification on GitHub depends on the key being registered in your GitHub account and matching the committer
  email. Misconfiguration may result in "unverified" signatures.

## Network & Third-Party Services

- The Extension communicates with `store.steampowered.com` (to read game pages) and `api.github.com` (to read/write
  repository files). These are third-party services with their own terms, privacy policies, and availability guarantees.
- The Extension has no control over the availability, accuracy, or behavior of these services.
- Network errors, API changes, or service outages may cause the Extension to fail silently or produce unexpected
  results.

## Limitation of Liability

In no event shall the developer(s) of this Extension be liable for any claim, damages, or other liability, whether in an
action of contract, tort, or otherwise, arising from, out of, or in connection with the Extension or the use or other
dealings in the Extension.

This includes but is not limited to:

- Loss of data or repository corruption
- Unauthorized access resulting from compromised tokens or keys
- Inaccurate game information leading to any form of loss
- Any consequences of commits made to your repository by the Extension

## Changes to This Disclaimer

This disclaimer may be updated at any time without prior notice. Continued use of the Extension after changes
constitutes acceptance of the updated terms.

---

*If you have concerns about any of the above, please discontinue use of the Extension
and [open an issue](https://github.com/poli0981/steam-f2p-extension/issues) on the repository.*
