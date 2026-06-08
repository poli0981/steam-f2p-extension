# Third-Party Notices

This document lists third-party components used by the Steam F2P Tracker Extension, along with their respective
licenses.

---

## OpenPGP.js

- **Location:** `lib/openpgp.min.mjs`
- **Version:** 6.x
- **License:** LGPL-3.0
- **Repository:** [openpgpjs/openpgpjs](https://github.com/openpgpjs/openpgpjs)
- **Usage:** Optional GPG commit signing. The library is used unmodified in its pre-built ESM distribution form.
- **License text:** https://github.com/openpgpjs/openpgpjs/blob/main/LICENSE

### LGPL-3.0 Compliance

This Extension uses openpgp.js as a separate, unmodified library file (`lib/openpgp.min.mjs`). In accordance with
LGPL-3.0:

- The openpgp.js library can be replaced by the user with any compatible version.
- The library is dynamically loaded as an ES module and is not statically linked or compiled into the Extension's own
  code.
- The Extension's own source code is licensed under GPL-3.0, which is compatible with LGPL-3.0.

---

## Chrome Extension APIs

- **Provider:** Google (Chromium project)
- **License:** BSD-3-Clause (Chromium), proprietary (Chrome)
- **Usage:** `chrome.storage` (+ `onChanged` events), `chrome.runtime`, `chrome.tabs`, `chrome.windows`, `chrome.action`
- **Note:** These are browser-provided APIs, not bundled dependencies.

---

## GitHub REST API

- **Provider:** GitHub, Inc.
- **Terms:
  ** [GitHub API Terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features)
- **Usage:** Contents API for file read/write, Git Database API for signed commits.
- **Note:** Not a bundled dependency. The Extension makes HTTP requests to `api.github.com`.

---

## Steam Store

- **Provider:** Valve Corporation
- **Terms:** [Steam Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/)
- **Usage:**
  - Content scripts read publicly visible DOM data from Steam store **app** and **search** pages.
  - On search pages, the service worker queries Steam's public Store Web API endpoint
    `store.steampowered.com/api/appdetails?appids=<id>&filters=basic` to read an app's `type`
    (game / mod / video / dlc / …) so that non-games are not added to the queue. This is an
    **undocumented / unofficial** endpoint, requires **no API key**, returns only public catalog
    data, and its results are cached in memory.
- **Note:** Not a bundled dependency. No Steam API keys are used by the Extension.

---

## knip (development tooling — not distributed)

- **Location:** Not bundled. Declared as a `devDependency` in `package.json`; installed into `node_modules/` for local
  development only.
- **Version:** 5.x
- **License:** ISC
- **Repository:** [webpro-nl/knip](https://github.com/webpro-nl/knip)
- **Usage:** Dead-code analysis during development, run via `npm run knip`. knip scans for unused files and exports; it
  does not modify or contribute any code to the Extension.
- **Note:** **Not part of the published extension.** `package.json`, `package-lock.json`, `knip.json`, and
  `node_modules/` are excluded from the release ZIP build.

---

## No Other Runtime Dependencies

The Extension is built with vanilla JavaScript (ES2022+) and CSS custom properties. It bundles **no runtime npm
dependencies**, has no build step, and ships no third-party libraries beyond openpgp.js listed above.

The only npm package used in this repository is `knip` (above) — a development-only dead-code checker that is **not
distributed** with the Extension.
