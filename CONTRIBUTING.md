# Contributing

Thank you for your interest in contributing to the Steam F2P Tracker Extension. This document outlines the guidelines
for contributing via issues and pull requests.

Please read and follow the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

---

## Table of Contents

- [Opening an Issue](#opening-an-issue)
- [Issues That Will Be Ignored](#issues-that-will-be-ignored)
- [Pull Requests](#pull-requests)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [License](#license)

---

## Opening an Issue

There are two ways to open an issue:

1. **Use a template** (recommended) — choose from the available templates:
    - 🐛 **Bug Report** — something is broken or behaving unexpectedly
    - ✨ **Feature Request** — suggest a new feature or improvement

2. **Open a blank issue** — for anything that doesn't fit the templates above

### Issue Requirements

All issues must be **clear, direct, and relevant**. Get straight to the point.

#### Required Fields

| Field           | Description                                                                                                                                     |
|-----------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| **Title**       | Short and descriptive. Examples: `Fix duplicate detection for region-locked games`, `Add support for Firefox`, `Optimize queue push batch size` |
| **Description** | Explain the problem or feature clearly. What is happening? What should happen instead? What do you want added and why?                          |
| **Reason**      | Why does this matter? What use case does it address?                                                                                            |

#### Optional Fields

| Field                          | When to Include                                                 |
|--------------------------------|-----------------------------------------------------------------|
| **Screenshots**                | UI bugs, visual issues, unexpected behavior                     |
| **Browser & version**          | Browser-specific bugs (e.g., Chrome 124, Edge 123)              |
| **OS**                         | Platform-specific issues (e.g., Windows 11, macOS 14)           |
| **Extension version**          | Found in the popup header or `manifest.json`                    |
| **Error logs**                 | Console errors, extension log export (Settings → Export Logs)   |
| **Pseudocode / code snippets** | When suggesting implementation approaches                       |
| **Steps to reproduce**         | For bugs — numbered steps to trigger the issue                  |
| **Steam store page URL**       | For detection issues — the specific page where detection failed |

### Good Issue Examples

**Good title:** `Anti-cheat not detected on CS2 store page`  
**Good description:** "Visiting the CS2 store page (https://store.steampowered.com/app/730/), the extension shows
anti-cheat as '-' but CS2 uses VAC. The VAC category label appears in the page source under `.game_area_details_specs`."

**Good title:** `Add bulk import from Steam curator list`  
**Good description:** "It would be useful to import all F2P games from a Steam curator list URL. This would allow
tracking curated lists without visiting each page individually."

### Bad Issue Examples

- ❌ "It doesn't work" — no description, no context
- ❌ "Please add everything" — vague, no specific feature
- ❌ "Your code is trash, fix it" — hostile, not actionable

---

## Issues That Will Be Ignored

The following issues will be **closed without response** or ignored:

### Content Violations

- Derogatory, insulting, or abusive language
- Personal attacks against the maintainer or other contributors
- Discriminatory or hateful content of any kind

### Off-Topic

- Issues unrelated to this repository or extension
- General Steam/GitHub support questions (use their respective support channels)
- Game reviews, game recommendations, or game quality complaints
- Requests to add specific games (use the extension or the tracker repo's issue templates)

### Low Quality

- Empty or near-empty issues with no meaningful description
- Vague descriptions that cannot be acted upon ("it's broken", "fix this", "doesn't work")
- Issues that clearly show the contributor did not read existing documentation
- Duplicate issues that are already reported or addressed (search before opening)

### Bad Faith

- Intentionally misleading or fabricated bug reports
- Spam, advertising, or self-promotion
- Issues opened solely to harass or waste maintainer time
- Automated or bot-generated issues

### Out of Scope

- Requests for features that fundamentally conflict with the project's purpose
- Requests to support non-Chromium browsers without offering to help implement
- Security vulnerabilities reported as public issues (use [SECURITY.md](SECURITY.md) instead)
- Issues about the openpgp.js library itself (report to [openpgpjs/openpgpjs](https://github.com/openpgpjs/openpgpjs))
- Issues about Steam's website structure changing (these require investigation, not a bug report — provide the specific
  URL and what changed)

---

## Pull Requests

Pull requests are welcome. Please follow these guidelines:

### Before Submitting

1. **Open an issue first** for non-trivial changes. Discuss the approach before writing code.
2. **Check existing issues and PRs** to avoid duplicate work.
3. **Fork the repository** and create a feature branch from `main`.

### PR Requirements

Every pull request must include:

| Field             | Description                                                                                       |
|-------------------|---------------------------------------------------------------------------------------------------|
| **Title**         | Clear and concise. Use conventional format: `fix: ...`, `feat: ...`, `docs: ...`, `refactor: ...` |
| **Description**   | What does this PR do? Why is it needed?                                                           |
| **Related issue** | Link the issue this PR addresses: `Closes #123` or `Fixes #123`                                   |
| **Testing**       | How did you test this? What scenarios were verified?                                              |

### PR Template

When you open a pull request, please use the following structure:

```markdown
## Description

Brief description of what this PR does.

## Related Issue

Closes #(issue number)

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Refactor (code change that neither fixes a bug nor adds a feature)
- [ ] Documentation update
- [ ] Breaking change (fix or feature that would cause existing functionality to change)

## Changes Made

- Changed X to do Y
- Added Z module for W
- Removed deprecated Q

## Testing

- [ ] Tested on Chrome (version: ___)
- [ ] Tested with GPG signing enabled/disabled
- [ ] Tested push to GitHub (real or test repo)
- [ ] Tested on Steam store page (URL: ___)
- [ ] No console errors in service worker or popup

## Screenshots (if applicable)

<!-- Add screenshots for UI changes -->

## Checklist

- [ ] My code follows the project's code style
- [ ] I have commented my code where necessary
- [ ] I have updated documentation if needed
- [ ] My changes do not introduce new warnings or errors
- [ ] I have tested my changes thoroughly
```

### PR Guidelines

- **Keep PRs focused.** One PR should address one issue or feature. Do not bundle unrelated changes.
- **Keep PRs small.** Large PRs are harder to review. If a feature requires many changes, consider splitting into
  smaller PRs.
- **Do not modify `lib/openpgp.min.mjs`** unless updating to a new official release.
- **Do not add new dependencies.** This project intentionally has zero npm dependencies. If you believe a dependency is
  necessary, discuss it in an issue first.
- **Ensure the extension loads without errors** after your changes. Test by loading unpacked in Chrome.

### Review Process

- The maintainer will review PRs as time permits. This is a solo-maintained project — please be patient.
- You may be asked to make changes before a PR is merged.
- PRs that do not meet the requirements above may be closed without merging.

---

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/poli0981/steam-f2p-extension.git
   cd steam-f2p-tracker-extension
   ```

2. Load the extension in Chrome:
    - Navigate to `chrome://extensions`
    - Enable **Developer mode**
    - Click **Load unpacked** and select the project directory

3. Make changes and reload:
    - Edit files directly — no build step required
    - Click the reload button on `chrome://extensions` to apply changes
    - For content script changes, also reload the Steam store page

4. Test:
    - Visit any Steam store page to test detection
    - Use the popup to test queue operations
    - Use Settings to configure GitHub and test push

### Project Structure

```
steam-f2p-extension/
├── manifest.json          # Extension configuration
├── background/            # Service worker modules
│   ├── sw.js              # Entry point & message router
│   ├── github-api.js      # GitHub REST API client
│   ├── gpg-signer.js      # GPG key management & signing
│   ├── dedup-checker.js   # Remote deduplication
│   ├── push-handler.js    # Push orchestrator
│   └── queue-manager.js   # Queue CRUD
├── content/
│   └── detector.js        # Steam page parser
├── popup/                 # Toolbar popup UI
├── queue/                 # Queue management page
├── settings/              # Settings page
├── shared/                # Shared utilities & styles
│   ├── constants.js       # Configuration & defaults
│   ├── storage.js         # chrome.storage wrapper
│   ├── logger.js          # Structured logging
│   ├── utils.js           # Link parsing, helpers
│   └── theme.css          # Design system
├── lib/
│   └── openpgp.min.mjs    # OpenPGP.js (LGPL-3.0)
└── icons/
```

---

## Code Style

- **Language:** Vanilla JavaScript (ES2022+), no transpilation
- **Modules:** ES modules with static imports only (MV3 requirement — no `await import()` in service worker)
- **Formatting:** 2-space indentation, single quotes preferred, semicolons required
- **Naming:** camelCase for variables/functions, PascalCase for classes, UPPER_SNAKE_CASE for constants
- **Comments:** JSDoc for all exported functions. Inline comments for non-obvious logic.
- **No dependencies:** Do not add npm packages. Vanilla JS only.
- **CSS:** Use CSS custom properties defined in `shared/theme.css`. No CSS preprocessors.
- **DOM:** Use `textContent` for safe text insertion. Never use `innerHTML` with dynamic data.

---

## License

By contributing to this project, you agree that your contributions will be licensed under the [GPL-3.0](LICENSE)
license.
