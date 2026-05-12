# Development Environment

How to set up a local environment to work on the Steam F2P Tracker extension.
This document is project-specific; for the maintainer's broader development
hardware see [pc_spec.md](pc_spec.md).

Vietnamese mirror: [docs/i18n/vi/dev_env.md](i18n/vi/dev_env.md).

## IDE

Any modern editor will do. The maintainer uses:

- **JetBrains IDEs 2026.x** (paid lineup) — WebStorm for the extension itself,
  RustRover / PyCharm / Rider for sibling projects (not used here).
- **VS Code** — as a lightweight alternative.

There is no project-specific IDE config committed. ESLint / Prettier are not
wired in (the codebase keeps style by convention; see CONTRIBUTING.md).

## Required toolchain

This extension is vanilla JS with no build step. The only tools you need are:

| Tool | Used for | Minimum |
|------|----------|---------|
| Chromium-based browser | Loading the unpacked extension | Chrome 120+ (MV3) |
| Node.js | `node --check` syntax validation before commit | Node 20+ |
| `jq` | Validating `manifest.json` / JSONL files | recent |
| Git | Source control | recent |
| GPG | Signing commits and release tags (`commit.gpgsign=true`) | 2.4+ |
| pinentry-Qt (or compatible) | Unlocking the GPG key during tag signing | matches GPG |

The maintainer's machine ships with Python, Rust, and .NET as well, but none
of those are needed to work on this extension specifically.

## Project layout (high level)

```
manifest.json           Chrome MV3 manifest, version of record
background/             Service worker + GitHub + GPG + queue modules
content/                Steam page scrapers (IIFE, not modules)
popup/ queue/ settings/ Three extension pages
shared/                 Constants, storage wrapper, helpers, theme.css
lib/                    Vendored openpgp.min.mjs + InterVariable.woff2
docs/                   Legal docs + this developer documentation
scripts/                JSONL output targets are inside the tracker repo, not here
.github/                Workflows, dependabot, FUNDING, issue templates
```

See [the architecture section of README.md](../README.md#architecture) for
runtime data flow.

## Loading the extension locally

1. Clone the repo (or `git pull` the latest `main`).
2. Open `chrome://extensions/`.
3. Toggle **Developer mode** (top-right).
4. **Load unpacked** → select the repo root.
5. After every change, click the **Reload** icon on the extension card.

## Recommended workflow

1. Create a feature branch named `<type>/<slug>-v<x.y.z>`. Types: `feat`,
   `fix`, `refactor`, `chore`, `docs`, `ci`.
2. Make changes. Run `node --check path/to/changed-file.js` for each modified
   JS file before staging.
3. Validate `manifest.json` with `jq -e .version manifest.json`.
4. Bump `manifest.json` `"version"` and add a section to `CHANGELOG.md` if the
   change ships in a release.
5. Commit. The maintainer signs commits with their GPG key; pre-commit hooks
   are not configured but the release tag is always signed.
6. Open a PR. The CI surface today is light (Release workflow only fires on
   tag push). A PR-time validation workflow is planned for v2.5.0.

## Releasing

See the "Standard shipping flow" section of the v2-roadmap planning note (not
committed in-repo). Short version:

```
git tag -s vX.Y.Z -m "release notes..."
git push origin vX.Y.Z
```

The Release workflow builds the ZIP and creates the GitHub release with the
tag annotation as the body. As of v1.14.0 it also creates a Discussion in the
`Announcements` category.

## Useful one-liners

```bash
# Quick syntax check across every JS file (skip vendored lib/)
find . -name '*.js' -not -path './lib/*' -not -path './.git/*' \
  -exec node --check {} \;

# Verify all JSON in the repo parses
find . -name '*.json' -not -path './.git/*' \
  -exec sh -c 'jq -e . "$1" >/dev/null || echo "BAD: $1"' _ {} \;
```
