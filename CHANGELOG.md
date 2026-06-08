# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.6.0] - 2026-06-08

### Added

- **`docs/DETECTION.md` — the detection-flow reference.** A detailed,
  code-level walkthrough of how the extension detects and classifies
  games: content-script load order and the shared namespace, the
  page-type fast path (DLC / demo / playtest / delisted / coming-soon /
  mod / video), price and free-type logic, the two anti-cheat passes, the
  service-worker auto-collect gate, deduplication (local queue + remote
  master DB), and the search-page hover flow. Linked from the README's
  Architecture section.

### Notes

- Documentation only — no extension code changes. `docs/DETECTION.md` is a
  developer doc and is excluded from the release ZIP, alongside
  `docs/pc_spec.md` and `docs/dev_env.md`.

---

## [2.5.0] - 2026-06-08

### Added

- **Search-page detection — triage free games on hover.** On a
  `store.steampowered.com/search` results page, hovering a game now shows
  a small tooltip with its status (free / already in your queue / already
  in the tracker database) plus an **Add to queue** button, so free games
  can be queued without opening each app page.
  - A new **Search-page detection** section in Settings turns it on
    (opt-in, off by default).
  - **Add to queue** queues a free, untracked game on click.
  - **Auto-add free games on hover** (sub-toggle, off by default) queues
    them on a sustained hover instead, subject to the same per-appid
    5-minute session cooldown as page auto-collect.
  - Searches filtered to non-game categories (DLC, soundtracks, playtests,
    videos, mods, demos) are skipped automatically.

### Notes

- Reuses the existing `CHECK_DUPLICATE` (local queue + remote master DB)
  and `AUTO_ADD_FROM_PAGE` flows — the latter gains a `source` parameter
  so the service worker remains the single gate / cooldown / dedup
  authority for both the app-page and search-page paths. A new content
  script `content/search-detector.js` runs on `search*` via a second
  `content_scripts` entry (the existing `store.steampowered.com` host
  permission already covers it). Two new opt-in settings; no new
  permissions or message types.
- Search-row entries carry only what the row exposes (name, capsule
  image, platforms, release date); developer / publisher / tags /
  description / anti-cheat stay blank and user-editable.

---

## [2.4.0] - 2026-06-08

### Added

- **Community-made mod and Steam Video detection.** App pages for
  community-made mods (which carry a `.game_area_mod_bubble`
  "Community-Made Mod" notice) and Steam Video products (an
  `<h2>Steam Video</h2>` online-streaming notice) are now recognised as
  non-game pages. The popup badges them and disables the Add button
  ("Mod — Not a game" / "Video — Not a game"); auto-collect surfaces an
  informational toast and never queues them.

### Fixed

- **Mods are no longer mis-queued as free games.** A community-made mod
  page advertises "Free To Play" with an "Install now" button, so before
  this release auto-collect read it as a free game and added it to the
  queue. The new mod guard runs before the free-type classification, so
  the enqueue is blocked.

### Notes

- Mirrors the existing "not queueable" page-type handling (DLC / demo /
  playtest / delisted / coming-soon): two new classifiers
  (`isModPage` / `isVideoPage`) in `content/extract-type.js`, `is_mod` /
  `is_video` flags threaded through the detector fast path, the
  service-worker auto-collect gate, and the popup blocked-branches.
  Reuses the `notify_dlc_demo` toggle and adds EN + VI toast strings —
  no new permissions, settings, or message types.

---

## [2.3.0] - 2026-05-22

### Fixed

- **Anti-cheat detection no longer false-positives on short codes.**
  The fallback dictionary scan (Pass 2 of `detectAntiCheat`, used when
  Steam's structured `.anticheat_section` is absent) matched short
  codes like `vac` and `kss` with a plain substring search — so a
  description containing "vacation" was misread as VAC-protected. Pass
  2 now matches patterns of five characters or fewer on word
  boundaries; longer and multi-word patterns keep the substring search.

### Notes

- Pass 1 (the structured `.anticheat_section` reader) and
  `lookupACLabel()` are unchanged — they read focused AC-name strings,
  not free text, so a substring match is correct there.
- Adds an `escapeRegex()` helper to `content/lib-dom.js`. No new
  permissions; `anti_cheat` remains a user-editable queue field.

---

## [2.2.0] - 2026-05-22

### Added

- **GitHub health indicator in the popup.** The header status dot now
  reflects recent GitHub activity instead of only connection config:
  - **green** — configured, no GitHub errors in the last 15 minutes
  - **yellow** — a GitHub error 5–15 minutes ago
  - **red** — a GitHub error within the last 5 minutes
  - **grey** — GitHub not configured
- Hovering the dot shows the most recent relevant log line; clicking it
  (when configured) opens a themed modal listing the last 10
  `github`-category log entries. The dot updates live if a push fails
  while the popup is open.

### Notes

- Health is derived from the existing structured logs via `GET_LOGS`
  filtered to the `github` category — no new permissions, settings, or
  message types. A new `infoDialog()` in `shared/modal.js` renders the
  log modal as a single-button companion to `confirmDialog()`.

---

## [2.1.0] - 2026-05-22

### Added

- **Queue backup — export and import.** A new **Data** section in
  Settings can save the pending queue to a timestamped
  `queue-backup-YYYY-MM-DD.json` file and restore it later — useful
  before clearing storage or moving to another browser.
  - **Export Queue** downloads every queued game as formatted JSON.
  - **Import — Merge** adds games from a backup, skipping any appid
    already in the queue.
  - **Import — Replace** discards the current queue first, then loads
    the backup.

### Notes

- Imports are validated before anything changes: the file is capped at
  2 MB, must parse as JSON, and each entry must carry a Steam link a
  valid appid can be read from. A themed confirmation dialog precedes
  both merge and replace; the result toast reports how many games were
  imported versus skipped (duplicates, queue-full, or unreadable
  entries).
- Restored entries keep their original `added_at` timestamp and any
  edited fields — import reuses the same `RESTORE_ENTRY` path as the
  Queue page's undo, and the 150-game cap still applies. No new
  manifest permissions.

---

## [2.0.1] - 2026-05-22

### Fixed

- **"Coming soon" games are no longer auto-collected.** When a Steam
  store page shows the not-yet-released bubble (`.game_area_comingsoon`,
  "This game is not yet available on Steam"), the extension now treats
  it as a non-queueable page type — reusing the same fast path already
  used for DLC / demo / playtest / delisted pages. Previously such a
  page had no price element, fell back to its still-present "Free to
  Play" tag, was classified `f2p`, and was added to the queue by
  auto-collect before the game had even released.
- The popup "Add to Queue" button is now also disabled on a coming-soon
  page (badge: *Coming soon*), so the manual add path is covered too.

### Notes

- A new `coming_soon` auto-collect outcome surfaces an in-page toast
  (EN + VI), gated by the existing `notify_dlc_demo` toggle — **no new
  setting** and **no new manifest permissions**.
- Detection is primarily class-based (`.game_area_comingsoon`), so it is
  locale-independent; an English notice-text check ("not yet available")
  is kept as a fallback. Pre-purchase coming-soon pages are caught too —
  harmless, as they were already blocked as paid.

---

## [2.0.0] - 2026-05-20

Milestone release marking the end of the 1.x line. **No functional
changes** — `2.0.0` is a version bump that closes out the UI/UX
modernization arc spanning v1.7.0 through v1.17.2. Every item below
already shipped under the version noted; this entry is a narrative
summary, not new work.

### Changed

- `manifest.json` version bumped to `2.0.0`. No JavaScript, HTML, or
  CSS behaviour changed in this release.

### The 1.x → 2.0 journey

- **Visual refresh** (v1.7.0) — WCAG-AA colour palette, bundled Inter
  Variable typeface, layered shadows and `backdrop-filter`, hover
  micro-interactions, automatic light-mode variant.
- **Structural UI overhaul** (v1.8.0 – v1.12.0) — focus-trapped themed
  modal dialog, Info/Edit tablist on queue cards, skeleton loaders, an
  in-app System / Light / Dark theme toggle, and a stacked toast
  system with undo-progress bars.
- **Smarter queue** (v1.13.0, v1.15.0) — auto-prune against the
  upstream master data, and a popup queue-full guard at the 150-entry
  cap.
- **Release & CI hardening** (v1.14.0 – v1.14.2) — tag-driven release
  automation, auto-created announcement Discussions, Dependabot, and
  bilingual developer docs.
- **Opt-in auto-collect** (v1.16.0 – v1.16.2) — the content script can
  auto-queue free games with localized in-page toasts; later hardened
  with master-database dedup and a guard that skips delisted games.
- **Final polish** (v1.17.0 – v1.17.2) — a scroll-to-top button on the
  long pages, plus `knip` dead-code tooling and the cleanup it
  surfaced.

Full detail for each item is in its version's entry below.

---

## [1.17.2] - 2026-05-20

### Changed

- **`docs/THIRD_PARTY_NOTICES.md` now documents `knip`.** The
  development-only dead-code checker added in v1.17.1 gets its own
  ISC-licensed entry, and the closing section is reworded to
  "No Other Runtime Dependencies" to make explicit that `knip` is a
  `devDependency` and is not distributed with the extension.

---

## [1.17.1] - 2026-05-20

### Changed

- **Added `knip` as a dev-only dead-code checker.** A minimal
  `package.json` + `knip.json` let `npm install && npm run knip` flag
  unused files and exports across the ES-module graph (service worker,
  `shared/`, the three UI pages). The extension still ships **zero
  runtime dependencies** — `knip` is a `devDependency`, and
  `package.json` / `package-lock.json` / `knip.json` are excluded from
  the published release ZIP.

### Removed

- Dead code found by the knip audit:
  - `sanitize()` in `shared/utils.js` — exported but never called.
  - The `export` keyword on `normalizeLink()` (`shared/utils.js`) and
    `log()` (`shared/logger.js`) — each is used only inside its own
    module, so both are now plain internal functions.

### Notes

- knip analyses the ES-module graph only; the `content/` scripts are
  IIFEs sharing `globalThis.SF2P` and are listed as knip entry points
  so they are not mis-reported as unused.

---

## [1.17.0] - 2026-05-20

### Added

- **Scroll-to-top button on the Settings and Queue pages.** A small
  floating button appears in the bottom-right corner once the page is
  scrolled past ~320 px; clicking it returns to the top. The scroll is
  smooth, or instant when the OS "reduce motion" preference is set.
- Implemented as a shared `shared/scroll-to-top.js` module that both
  pages inject at init — no HTML changes; styling via a new
  `.scroll-top-btn` rule in `shared/theme.css`.

### Notes

- The button shares the bottom-right corner with the toast stack
  (z-index 9999); a transient toast briefly renders above the button
  (z-index 50), which is expected.

---

## [1.16.2] - 2026-05-20

### Fixed

- **Delisted games are no longer auto-collected.** When a Steam store
  page shows the "no longer available on the Steam store" notice
  (`#purchase_note`), the extension now treats it as a non-queueable
  page type — reusing the same fast path already used for DLC / demo /
  playtest. Previously such a page had no price element, fell back to
  its still-present "Free to Play" tag, was classified `f2p`, and was
  added to the queue by auto-collect.
- The popup "Add to Queue" button is now also disabled on a delisted
  page (badge: *Not available*), so the manual add path is covered too.

### Notes

- A new `unavailable` auto-collect outcome surfaces an in-page toast
  (EN + VI), gated by the existing `notify_dlc_demo` toggle — **no new
  setting** and **no new manifest permissions**.
- Detection matches the English notice text ("no longer available"),
  consistent with the extension's other English-based page scraping; a
  non-English Steam store locale would not be recognised.

---

## [1.16.1] - 2026-05-16

### Fixed

- **Auto-collect now checks the master database before enqueue.** When a
  Steam page's appid is already present in the upstream tracker repo's
  sharded `data_NNN.jsonl` files (discovered via `data/index.json`),
  auto-collect now skips the enqueue and surfaces an
  `... is already in the master database` toast (EN + VI). Previously the
  entry would be added to the local queue and only dropped later by
  `auto_prune_queue` after the next push, leaving transient noise in
  the queue between collection and push.
- The new check reuses the existing 5-minute dedup cache
  (`fetchRemoteAppIds()` in `background/dedup-checker.js`) so warm
  hits are an O(1) `Set` lookup. On a cold cache + network failure,
  `checkDuplicate()` silently fails open and the auto-collect handler
  falls through to the prior local-only behaviour — no toast, no
  blocked enqueue.
- Gated by the existing `notify_duplicate` setting toggle. When that
  toggle is off, the action is still emitted (`master_duplicate`) for
  telemetry but no toast is shown.
- Logged at info level under the `dedup` category:
  `Auto-collect skipped (in master): <appid>`.

### Scope

- **Auto-collect only** (`MSG.AUTO_ADD_FROM_PAGE` in `background/sw.js`).
  The manual popup "Add to Queue" path is unchanged — it still uses
  the separate `MSG.CHECK_DUPLICATE` flow it has had since v1.0.0.
- The existing `result.error_code === ERROR_CODE.DUPLICATE` branch in
  the auto-collect handler is **retained as a race-condition backstop**
  in case another tab enqueues the same appid between the new
  `checkDuplicate()` call and `addToQueue()`.

### Notes

- **No new manifest permissions.** Reuses the existing GitHub host
  permission and the cache infrastructure that has shipped since
  v1.2.0.
- **No new setting.** The single `notify_duplicate` toggle now covers
  both "already in queue" and "already in master database" toasts.

---

## [1.16.0] - 2026-05-16

### Added

- **Auto-collect on Steam pages (opt-in)** — new **Settings → Auto-collect**
  section with a master toggle (default OFF). When enabled, the content
  script on `store.steampowered.com/app/*` reports detection results to
  the service worker, which auto-adds free games to the queue and
  surfaces an in-page toast in the bottom-right corner of the browser
  for every outcome:
  - Free game added → `Game [name] with id [id] added`
  - Page is not free → `Game [name] with id [id] is not free`
  - Page is DLC / demo / playtest → `This page is DLC` (etc.)
  - Game already in queue → `[name] is already in the queue`
  - Queue is full → `Queue is full (150/150)` with an **Open queue** link
    that opens the singleton Queue tab via the existing
    `MSG.OPEN_EXTENSION_PAGE` helper

- **Per-event notification toggles** — five sub-toggles under the master
  switch (default all ON) let the user silence any subset of toast
  categories (`notify_added`, `notify_not_free`, `notify_dlc_demo`,
  `notify_duplicate`, `notify_queue_full`).

- **Bilingual notifications** — new `notify_lang` setting (Auto / English
  / Tiếng Việt). `Auto` resolves to `vi` when the service worker's
  `navigator.language` starts with `vi`, otherwise `en`.

- **In-page toast renderer** — new `content/in-page-toast.js`. Uses a
  Shadow DOM host attached to `document.documentElement` (NOT body —
  Steam mutates body subtrees during in-page navigation). Inline CSS
  inside the shadow root + `z-index: 2147483647` keep Steam's global
  styles from clobbering the toast.

- **5-minute per-appid cooldown** — auto-collect notifications are
  deduped via `chrome.storage.session` so rapid refreshes / tab
  re-opens of the same Steam page don't spam toasts. Volatile across
  browser restarts.

- **Structured error codes** — `addToQueue()` now returns an
  `error_code` field alongside the human-readable `error` string
  (`QUEUE_FULL`, `DUPLICATE`, `INVALID_DATA`, `INVALID_LINK`,
  `NO_APPID`). The popup still surfaces `error` as before; the new
  auto-collect handler branches on `error_code` to pick the right
  localized toast.

### Why

The detector already ran on every `store.steampowered.com/app/*` page;
users had to click **Add to Queue** in the popup to actually enqueue.
Auto-collect closes that loop without losing the manual path — the
existing popup button still works identically (including the
v1.15.0 queue-full guard). The feature is opt-in because automatic
data-collection on every Steam page is intrusive by default; users
can flip it on once they've reviewed the new Settings section.

### Notes

- **No new manifest permissions.** The feature reuses `storage`
  (already present, including the `chrome.storage.session` sub-API)
  and `activeTab`. No `notifications`, no `tabs`.
- **Auto-collect does NOT bypass `auto_push_threshold`.** Push still
  triggers only when the queue size crosses the threshold the user
  configured. Auto-collect just feeds entries in; the existing push
  pipeline is unchanged.
- **Service worker is the single source of truth** for the auto-collect
  gate and language selection. Flipping the master toggle or any
  sub-toggle takes effect on the next page scan — no content-script
  reload required.
- New content script `content/in-page-toast.js` is listed third in
  `manifest.content_scripts.js` (after `ns.js` and `lib-dom.js`,
  before the extractors).

---

## [1.15.0] - 2026-05-16

### Added

- **Popup — Queue-full guard on the Add button** — when the local queue is at
  `QUEUE_MAX` (150 entries) and the current Steam page would otherwise be
  addable (free, not duplicate, not DLC/demo/playtest), the **Add to Queue**
  button is disabled with a `Queue full (150/150)` label, and a hint appears
  underneath: `Queue is full. Open Queue to prune.` The hint link opens the
  Queue Manager via the existing singleton-tab helper.
- **Live re-enable on prune** — the popup already listens to
  `chrome.storage.onChanged` for queue size changes (since v1.5.0); the same
  listener now drives the Add-button state, so if the user prunes the queue
  in another tab while the popup is open, the button returns to its normal
  **Add to Queue** state without requiring a popup reopen.

### Why

Before this change, the popup let users click **Add to Queue** even when the
queue was full; the request reached the service worker, was rejected with
`Queue is full (150/150)`, and surfaced as a generic error toast. The new
guard makes the precondition visible up front, removes a wasted round-trip,
and provides a one-click path to the Queue Manager where entries can be
removed or pushed.

### Notes

- No new permissions, no new message types, no manifest changes beyond the
  version bump. The guard reuses `MSG.GET_QUEUE_SIZE`, `QUEUE_MAX`, and
  `MSG.OPEN_EXTENSION_PAGE` — all pre-existing.
- The DLC / demo / playtest / paid / duplicate early-return branches in
  `showDetectedGame()` keep their existing labels; the queue-full state only
  applies to games that would otherwise be addable.

---

## [1.14.2] - 2026-05-12

### Changed

- **Release workflow** — bumped pinned actions to their Node 24 lines so the
  workflow stops triggering GitHub's deprecation warning and keeps running
  after the 2026-06-02 forced-Node 24 cutover (and the 2026-09-16 Node 20
  removal):
  - `actions/checkout@v4` → `@v6` (Node 24 since v5.0.0, released 2025-08-11)
  - `softprops/action-gh-release@v2` → `@v3` (Node 24 as of v3.0.0, released
    2026-04-12)

No runtime changes. Extension code, UI, manifest permissions, and shipped
ZIP contents are identical to v1.14.1 apart from the version string.

---

## [1.14.1] - 2026-05-12

### Fixed

- **Release workflow** — added `discussions: write` to the `permissions:` block
  in `.github/workflows/release.yml`. Without it, the v1.14.0 release tag
  successfully built and uploaded the ZIP but failed to auto-create the
  GitHub Discussion (workflow error: `Discussion could not be created. Make
  sure you passed a valid category name.`). The category name was fine; the
  default `GITHUB_TOKEN` simply lacked the scope needed by the
  `discussion_category_name` parameter on `softprops/action-gh-release@v2`.
  Future tag pushes will now auto-create the Discussion as intended.

No runtime changes. Extension code, UI, manifest permissions, and shipped
ZIP contents are identical to v1.14.0 apart from the version string.

---

## [1.14.0] - 2026-05-12

### Added

- **Settings → Connect with Developer** — new section linking to the maintainer's
  X, YouTube, Discord (repo + game), Bluesky, Mastodon, Telegram, Steam profile,
  and email.
- **Settings → Support Development** — new section with GitHub Sponsors, Ko-fi,
  Buy Me a Coffee, Patreon, and PayPal buttons. Mirrors the GitHub `FUNDING.yml`
  the repo already shipped.
- **Settings → Help & Feedback** — Report a Bug / Request a Feature buttons that
  open the corresponding GitHub Issue templates pre-filled.
- **Auto-create GitHub Discussion on release** — `softprops/action-gh-release@v2`
  now receives `discussion_category_name: "Announcements"`, so every release tag
  also opens a discussion thread. Requires Discussions to be enabled on the repo
  with an `Announcements` category present (GitHub's default).
- **Dependabot** — new `.github/dependabot.yml` scans `github-actions` weekly
  (Mon 08:00 Asia/Ho_Chi_Minh). No other ecosystems apply (project is vanilla
  JS, no `package.json`).
- **Docs** — new `docs/pc_spec.md` (maintainer's dev machine) and
  `docs/dev_env.md` (project-specific IDE + toolchain + workflow), plus
  Vietnamese mirrors under `docs/i18n/vi/`.

### Changed

- **Notifier workflows narrowed** — `notify-ci-failure.yml` and
  `notify-release-pipeline.yml` previously listened to
  `workflow_run: workflows: ["*"]`, firing on every workflow completion and
  spamming the Actions UI with "Skipped" runs. They now listen only to
  `Release` and `Announce Release to Discord`.
- **Release ZIP** — `release.yml` now also excludes `docs/pc_spec.md`,
  `docs/dev_env.md`, and `docs/i18n/*` from the published archive. Legal docs
  (`DISCLAIMER.md`, `PRIVACY_POLICY.md`, `TERMS_OF_USE.md`,
  `THIRD_PARTY_NOTICES.md`) still ship as before.
- **README** — added "Development & System Requirements" and "Support the
  project" sections.

### Settings layout

The three new sections sit between **Logging** and **Danger Zone** so the
destructive action stays at the bottom. Cards are addressable by anchor:
`#about-section`, `#donate-section`, `#help-section`.

---

## [1.13.0] - 2026-05-05

### Added

- **Auto-prune queue against master data** — when remote `data.jsonl` (or `temp_info.jsonl`) already
  contains a game that is sitting in the local queue, the queue entry is now removed automatically. Triggers:
  - **After successful push** (signed or unsigned) — silent; logged at info level under category `queue`.
  - **After Settings → "Refresh Cache Now"** — toast surfaces the pruned count with an Undo button.
  - **Manual** — new **Prune Duplicates Now** button in Settings → Cache.
- **Setting: `auto_prune_queue`** (default **on**) — toggle the auto behaviour from Settings → Cache. Existing
  installs inherit the default via `loadSettings()` defaults-merge; no migration needed.
- **Undo** — every user-triggered prune (manual button or Refresh Cache) shows an 8 s undo toast that calls
  `MSG.RESTORE_ENTRY` with the full removed-entry snapshots, mirroring the Clear-All flow from v1.6.0.

### Changed

- `MSG.REFRESH_CACHE` response now includes `data.pruned = {removed, remaining}` when auto-prune fired,
  `null` otherwise.
- `pushQueue()` and `pushQueueUnsigned()` no longer fire-and-forget `refreshDedupCache()`; they now call a
  shared `refreshCacheAndMaybePrune(settings)` helper that also runs the prune step when the setting is on.

### Added (infra)

- **`MSG.PRUNE_QUEUE_DUPLICATES`** — new message type. Payload `{forceRefresh?: boolean}`. Returns
  `{ok, data: {removed: Entry[], remaining: number}}`.
- **`pruneDuplicates(appidSet)`** in `background/queue-manager.js` — pure helper that takes a master appid
  Set, removes matching queue entries, returns full snapshots for Undo.

### Notes / caveats

- If you have hand-edited `notes`, `genre`, `safe`, etc. on a queue entry and a collaborator pushes that
  appid to master, auto-prune will discard your local edits along with the entry. The 8 s Undo covers
  user-triggered prunes (Refresh Cache, manual button). For post-push prune (silent), the edits are gone
  the moment the push succeeds. **Disable `auto_prune_queue` in Settings → Cache if this matters to your
  workflow.**

---

## [1.12.0] - 2026-04-19

### Added

- **Toast stacking** — multiple toasts can now be visible simultaneously. Removing a game while an undo toast
  from a previous remove is still counting down no longer wipes the first toast. Cap is 5 stacked toasts;
  additional toasts evict the oldest FIFO.
- **Undo progress bar** — `showUndoToast` renders a thin shrinking bar at the bottom of the toast that
  visualises the countdown. Pure-CSS `@keyframes toast-progress linear forwards` driven by a per-toast
  `--toast-duration` custom property. Hidden under `@media (prefers-reduced-motion: reduce)` (the dismiss
  timer still fires on schedule).

### Changed

- **Toast container** — new `.toast-container` fixed element (lazily created, `aria-live="polite"`,
  `role="status"`). Individual toasts are now `position: relative` inside the container instead of each
  being `position: fixed` at the same bottom/right — previously only one could exist before overlapping.
- Container has `pointer-events: none` so clicks fall through to the page; toasts opt back in with
  `pointer-events: auto`, so only the toasts (and the Undo button) capture input.
- `showToast()` accepts an optional `{duration}` opt for callers that need something other than the 2.5 s
  default.

### Phase B complete 🎉

All five Phase B tasks shipped (themed modal · queue card tabs · skeleton loaders · in-app theme toggle ·
toast stack with undo progress). The UI refresh roadmap (Option A in v1.7.0, then Option B tasks 1–5) is
done. The next natural milestone is the **v2.0.0 ribbon-cutting release**, which can fold in final polish
and mark the relaunch.

---

## [1.11.0] - 2026-04-19

### Added

- **In-app theme toggle** in Settings → Appearance. Three-state segmented control:
  - **System** (default) — follows OS `prefers-color-scheme`
  - **Light** — force light theme regardless of OS
  - **Dark** — force dark theme regardless of OS
- Preference persists under `settings.ui_theme` in `chrome.storage.local` and is applied across popup, queue,
  and settings pages.
- **Instant preview** — clicking a segment flips the UI immediately without needing to press Save.
- **Cross-tab sync** — changing the theme on the Settings page propagates to any open Queue tab (and vice
  versa) via `chrome.storage.onChanged`.
- **OS change reactive** — when in *System* mode, flipping your OS appearance flips the extension too,
  thanks to a `window.matchMedia("(prefers-color-scheme: light)")` listener.
- Keyboard: Arrow-Left/Right, Home, End cycle the segmented control (standard radio-group pattern).
  ARIA `role="radiogroup"` + `aria-checked` + roving `tabindex`.

### Added (infra)

- **`shared/theme-applier.js`** — new module exporting `applyTheme(setting)` and `initThemeSync()`. Each UI
  page imports and calls it at the top of its bundle so `<html data-theme>` is set before first paint.
- **`MSG.UPDATE_SETTINGS`** — partial-merge settings save, wrapping the existing `updateSettings()` helper
  from `shared/storage.js`. Lets the theme toggle persist without triggering a full-form save.

### Changed

- **`shared/theme.css`** — light-mode tokens now apply via **two** triggers:
  - The existing `@media (prefers-color-scheme: light) :root:not([data-theme="dark"])` branch (system
    following, same as v1.7.0+ behaviour)
  - A new `:root[data-theme="light"]` explicit override (wins regardless of OS)
  - A `[data-theme="dark"]` explicit override blocks system-light leakage so dark stays dark on OS-light.
- **`DEFAULT_SETTINGS.ui_theme = "system"`** added to `shared/constants.js`.

### Phase B progress

Remaining: toast stack + undo progress bar (Task 5). Modal, card tabs, skeleton loaders, and theme toggle
are all in. Ready for the v2.0.0 ribbon-cutting once Task 5 is done.

---

## [1.10.0] - 2026-04-19

### Added

- **Skeleton loaders** replace static "Checking page…" text and blank initial render:
  - **Popup** `#detectedLoading` now shows a skeleton preview of the detected-game card (thumbnail, two name/meta
    lines, two badge chips, and an action button placeholder). Layout dimensions match the real card so there is
    zero layout shift when the real data arrives. The old "Checking page…" text is moved to a `.sr-only` live
    region for screen readers.
  - **Queue page** renders three skeleton cards on the very first load via a new `renderSkeletonCards(3)` helper
    in `queue.js`. An `isFirstLoad` flag ensures subsequent re-renders (auto-refresh via `chrome.storage.onChanged`,
    manual Refresh button) never flash skeletons — only the initial cold load shows them.
- New `.skeleton` + `.skeleton-line` utility classes in `shared/theme.css`:
  - Linear-gradient shimmer (1.5 s loop) using `--bg-card` → `--bg-hover` → `--bg-card`
  - Theme-aware — auto light-mode branch swaps the gradient stops for lighter surfaces
  - `pointer-events: none` + `user-select: none` so skeletons don't steal hover / select interactions
  - Honours `@media (prefers-reduced-motion: reduce)` — shimmer animation disabled, solid peak colour held

### Styling

- `.game-card-skeleton` in `queue/queue.css` disables the v1.7.0 hover-lift effect on placeholder cards.
- `.detected-loading` CSS simplified — no longer forces `text-align: center` (skeleton layout is a row).

### ARIA

- `#detectedLoading` carries `aria-busy="true"` + `aria-live="polite"` so assistive tech announces the loading
  state without reading the decorative skeleton divs.

---

## [1.9.0] - 2026-04-19

### Changed

- **Queue card redesign.** Replaces the two separate collapsible panels (`▾ Game Info (auto-detected)` and
  `▾ Edit fields`) with a **single expandable *Details* section containing two tabs: Info / Edit**. Reduces
  collapsed card height by ~30 px and makes the information hierarchy clearer — one affordance to expand, a
  familiar tab pattern to switch context.
- Info tab is the default visible panel; Edit tab is hidden until clicked.
- ARIA: proper `role="tablist"` / `role="tab"` / `role="tabpanel"`, `aria-selected`, `aria-controls`,
  `aria-labelledby`, plus Arrow-Left / Arrow-Right / Home / End keyboard navigation. Only the active tab is
  tab-reachable (roving tabindex).
- Graceful empty state inside the Info panel when an entry has no auto-detected metadata.
- Toggle button now carries `aria-expanded` + `aria-controls`, keyboard-accessible.

### Styling

- New `.card-tabs`, `.card-tab`, `.card-tab-active`, `.card-panel`, `.card-panel-empty` in `queue/queue.css`.
  Active tab gets an underline indicator in the accent colour.
- Slide-in animation when the details section opens.
- Retired old `.game-card-auto`, `.game-card-fields`, `.auto-toggle`, `.edit-toggle` CSS blocks — no references
  left.

### Phase B progress

Remaining: skeleton loaders, in-app theme toggle UI, toast stack with undo progress bar.

---

## [1.8.0] - 2026-04-19

### Added

- **Themed confirmation dialog** — new `shared/modal.js` exports `confirmDialog({title, message, confirmLabel,
  cancelLabel, danger, defaultAction})` returning `Promise<boolean>`. Matches the extension's design system with
  `backdrop-filter` blur, spring entry animation, and adapts automatically to the light theme shipped in v1.7.0.
- Keyboard: `Enter` confirms, `Esc` cancels, `Tab` cycles focus between the two buttons (focus trap). Clicking the
  backdrop cancels. Focus is returned to the previously focused element after close.
- ARIA: `role="alertdialog"` + `aria-modal="true"` + `aria-labelledby`/`aria-describedby` for screen readers.
- Modal styles in `shared/theme.css` (dark + light variants). Compact padding via `@media (max-width: 480px)` so the
  modal fits nicely inside the 360 px popup.

### Changed

- **All 5 native `confirm()` call sites replaced** with `confirmDialog()`:
  - `queue.js`: Push All, Push Selected, Clear All (danger variant), GPG-signing-failed fallback
  - `popup.js`: GPG-signing-failed fallback
- Confirm wording tightened (singular/plural handling, clearer button labels like "Push 3" instead of generic
  "OK").

### Phase B progress

First ship of the v2.0.0 structural refresh roadmap. Remaining:
queue card redesign (tabs), skeleton loaders, in-app theme toggle,
toast stack with undo progress bar.

---

## [1.7.0] - 2026-04-19

### Added

- **Bundled Inter Variable font** at `lib/fonts/InterVariable.woff2` (~344 KB). Loaded via `@font-face` in
  `shared/theme.css` — no external CDN, MV3-safe. `font-display: swap` preserves instant-text-render with the
  system-font fallback while the woff2 loads.
- **Auto light theme** via `@media (prefers-color-scheme: light)`. A full token override inside `shared/theme.css`
  adapts backgrounds, text, accents, borders and shadows for light-mode users. No in-app toggle yet (that ships in
  v2.0.0 as part of the full refresh).
- **`.tabular-nums` utility class** and `font-variant-numeric: tabular-nums` on counters — queue count, log
  timestamps, activity times — so digits no longer shuffle width.
- **Reduced-motion support** — `@media (prefers-reduced-motion: reduce)` disables transforms and animations.

### Changed

- **Palette refresh** in `shared/theme.css`:
  - `--text-muted` `#5A6B7A` → `#7A8FA3` — now passes WCAG AA 4.5:1 on `--bg-card`. The old value was ~3.6:1.
  - `--accent-red` `#E74C3C` → `#F87171` (Tailwind red-400), hovers and contrast token adjusted.
  - `--accent-green` `#4FC978` → `#34D399` (emerald-400).
  - `--accent-yellow` `#F39C12` → `#FBBF24` (amber-400).
  - Kept Steam-blue `#66C0F4` as primary accent — the extension's identity colour.
  - Introduced `--accent-contrast`, `--accent-green-contrast`, `--accent-red-contrast`, `--accent-yellow-contrast`
    tokens so button and toast text colour flips correctly between dark and light modes.
- **Typography stack** now leads with `"Inter Variable", "Inter", "Segoe UI Variable Text", "Segoe UI",
  -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`. Inter renders consistently across OSes
  thanks to the local bundle; system variable fonts (Segoe UI Variable on Win11, SF Pro Text on macOS) are the
  graceful fallback.
- **Body** enables Inter stylistic sets (`cv11`, `ss01`) and grayscale antialiasing for sharper glyph edges.
- **Layered box-shadow tokens** — `--shadow-sm/md/lg` are now dual-pass shadows for realistic depth. Harmonised
  with separate values for light mode.
- **`.card` and `.game-card`** now translate up 1–2 px on hover with an accompanying shadow, giving tactile
  feedback without being distracting.
- **Buttons** (`.btn-primary`, `.btn-success`, `.btn-danger`) have a 1 px hover lift and press-down on `:active`.
- **Toasts** use `backdrop-filter: blur(14px) saturate(180%)` with a subtle 10 % border tint, and switched to the
  per-theme contrast tokens. Toast-warning and toast-info no longer fail to contrast in light mode.
- **Popup header** and **Queue / Settings page headers** are sticky with `backdrop-filter: blur(12px)
  saturate(180%)` against translucent backgrounds — gives a modern "frosted glass" feel while scrolling.
- **Scrollbar thumb** adapts in light mode.

### Fixed

- **WCAG AA regression** — `text-muted` was flagged at 3.6:1 on card backgrounds, below the 4.5:1 threshold for
  body text. Now 5.0:1.


### Fixed

- **Singleton-tab behaviour now works across tabs and windows.** The v1.5.0 implementation used
  `chrome.tabs.query({url: chrome.runtime.getURL(...)})` from the popup, which Chrome silently ignores when the
  extension lacks the `tabs` permission and has no matching host permission for `chrome-extension://` URLs. The URL
  filter was being dropped, an unrelated tab was being picked up, and the fallback opened a duplicate. Clicking
  **Queue** or **Settings** from any tab in any window now reliably focuses the existing tab.
- Secondary fix: removed the race between `openExtensionPage(...)` (async) and `window.close()` in the popup — the
  popup no longer relies on in-flight Chrome API calls completing after teardown.

### Changed

- **Tab registry moved to the service worker.** `background/sw.js` maintains a `Map<path, tabId>` of the extension
  tabs it has created. New `MSG.OPEN_EXTENSION_PAGE` delegates the open/focus decision to the sw.
  - sw creates the tab itself → knows the id without needing `chrome.tabs.query`
  - `chrome.tabs.onRemoved` listener drops stale entries
  - Reset Extension clears the registry alongside `detectedGames`
  - Stale id (onRemoved hasn't fired yet) gracefully falls through to a new `chrome.tabs.create`
- **Deleted** `shared/tab-manager.js` — the function now lives inside the sw.

### Permissions

No change — still only `storage` + `activeTab`.

---

## [1.6.0] - 2026-04-18

### Added

- **Push Selected** — each queue card now has a checkbox; the new *Push Selected (N)* button pushes only the checked
  entries. Leverages the existing `pushQueue({appids})` filter in `background/push-handler.js`. Selection state survives
  auto-refresh and is pruned to live entries after every re-render.
- **Scan Page** — a small *Scan* button inside the popup's detected-game card asks the active Steam tab's content
  script to re-run detection without a page reload. Picks up late-loading DOM (e.g. the language table, tags arriving
  after `document_idle`). No new manifest permissions — uses `chrome.tabs.sendMessage` to the existing content script.
  - `content/detector.js` orchestrator refactored: the scrape body lives in `SF2P.runDetection()`, invoked once at
    `document_idle` and again on `RESCAN_PAGE` messages.
  - `content/lib-dom.js` exposes `SF2P.clearDomCache()` which is called before every re-scan so cached selectors get
    re-queried.
- **Undo toast** for *Remove* and *Clear All* on the queue page. A new `showUndoToast(text, onUndo, opts)` in
  `shared/ui-helpers.js` renders an inline `[Undo]` button next to the text. Undo restores the entry(ies) verbatim via
  the new `MSG.RESTORE_ENTRY` path — original `added_at`, notes, and edited fields are preserved because
  `restoreEntry()` and `restoreEntries()` in `background/queue-manager.js` bypass `makeQueueEntry()` (which would
  otherwise regenerate the timestamp).
- `MSG.RESCAN_PAGE` and `MSG.RESTORE_ENTRY` added to `shared/constants.js`.

### Changed

- `queue/queue.js` — shared `runPush({appids, btn, originalHTML, onSuccess})` helper now powers both `pushAllBtn` and
  the new `pushSelectedBtn`, preserving the GPG fallback flow.
- `shared/theme.css` — styles for `.toast-undo` / `.toast-action` (the inline Undo button).
- `queue/queue.css` — styles for `.game-card-select` checkbox and `.is-selected` outline.

---

## [1.5.1] - 2026-04-18

### Added

- **CI/CD release automation** — new `.github/workflows/release.yml` triggers on any `v*.*.*` tag push. Verifies
  `manifest.json` version matches the tag, builds `steam-f2p-tracker-vX.Y.Z.zip` (excluding dev-only files), creates
  a GitHub release with the tag annotation as body, and uploads the ZIP as an asset. Signed tags are preserved with
  their "Verified" badge.

### Release flow

```bash
# Bump manifest.json version, merge to main, then:
git tag -s vX.Y.Z -m "release notes..."
git push origin vX.Y.Z   # workflow does the rest
```

---

## [1.5.0] - 2026-04-18

### Added

- **Singleton tabs** — new `shared/tab-manager.js` exporting `openExtensionPage(path)`. Clicking Queue or Settings in
  the popup now focuses any existing tab (via `chrome.tabs.query({url})` + `chrome.tabs.update` + `chrome.windows.update`)
  instead of piling up duplicates.
- **Auto-refresh via `chrome.storage.onChanged`**:
  - Queue page re-renders live (debounced 150 ms) when entries are added from the popup, removed by auto-push, or
    edited elsewhere.
  - Settings page reloads on settings / GPG-key changes, guarded by `isUserEditing()` so in-progress input is never
    clobbered.
  - Popup keeps the queue count and progress bar in sync while open.

### Changed

- **popup.js** — three `chrome.tabs.create(...)` sites replaced with `openExtensionPage()` (first-run setup, Queue
  button, Settings button).

---

## [1.4.0] - 2026-04-18

### Changed

- **Detector split** — the 820-line monolithic `content/detector.js` is broken into 9 content-script files sharing a
  `globalThis.SF2P` namespace:
  - `content/ns.js` — namespace init
  - `content/lib-dom.js` — `textOf`, `textsOf`, `hasCheck`, plus **cached selector getters** for `.app_tag`,
    `.dev_row`, breadcrumbs, and `#appHeaderGridContainer` (each was previously re-queried 2–4× per detection)
  - `content/extract-price.js` — schema.org + DOM price, paid-DLC scan
  - `content/extract-type.js` — `isDLCPage`, `isDemo`, `isPlaytest`, `classifyFreeType`
  - `content/extract-platform.js` — `detectOnlineOffline`, `extractPlatforms`
  - `content/extract-anticheat.js` — `ANTI_CHEAT_DB` + two-pass detection
  - `content/extract-metadata.js` — developer, publisher, release date, header image, name, genre, grid-layout helper
  - `content/extract-lang-tags.js` — language table + popular tags
  - `content/detector.js` — **orchestrator (149 lines, was 810)**, assembles `gameData`, dispatches `GAME_DETECTED`
- **manifest.json** `content_scripts.js` lists all 9 files in load order.

### Performance

- **Cached selectors** — frequently-used DOM queries are resolved once per page load and reused by all extract modules.
- **Early-return for DLC / demo / playtest** — the orchestrator now emits a minimal payload (name, header, genre,
  developer, type flags) and skips AC detection, language table, full tag scrape, publisher, release date, description,
  platforms. Saves ~40% scrape time on those page types. Safe because the popup blocks these from the queue anyway.

---

## [1.3.0] - 2026-04-18

### Added

- **Shared UI helpers** — new `shared/ui-helpers.js` exporting `$` (`document.querySelector`), `sendMessage`, and
  `showToast`. Previously duplicated across `popup.js`, `queue.js`, `settings.js`.

### Removed

- **Unused `alarms` manifest permission** — declared but never used (auto-push fires synchronously after each add).
- **Dead exports** (confirmed via grep, zero imports):
  - `OPTIONAL_FIELDS` (legacy alias of `EDITABLE_FIELDS`)
  - `CACHE_DATA_SHA`, `CACHE_TEMP_SHA` storage keys (abandoned caching strategy)
  - `getRecentLogs()` from `shared/logger.js`
  - `clearQueue()`, `getEntry()` from `background/queue-manager.js`

### Changed

- **queue.js** — push confirm dialog no longer references the deprecated `scripts/temp_info.jsonl` path in its wording.

---

## [1.2.1] - 2026-04-18

### Fixed

- **Language scraper** — rows Steam marks as "Not supported" (`<tr class="unsupported">` containing a single
  `<td colspan="3">Not supported</td>`) were bypassing the `cells.length < 2` header-skip guard and getting pushed
  with all flags `false`. `extractLanguages()` now:
  - Primary filter: skips any row with `classList.contains("unsupported")`
  - Defensive fallback: skips rows where none of interface / audio / subtitles have a checkmark

---

## [1.2.0] - 2026-04-18

### Changed

- **Multi-file dedup via `data/index.json`** — the dedup checker no longer reads a single `scripts/data.jsonl`.
  Instead it reads `data/index.json` (manifest describing all data files and their entry counts) and fetches every
  `data/data_NNN.jsonl` shard in parallel (`Promise.allSettled`). Falls back gracefully if the index is missing or an
  individual shard errors.
- **constants.js** — `REPO_DATA_PATH` removed; replaced with `REPO_INDEX_PATH = "data/index.json"` and
  `REPO_DATA_DIR = "data/"`. `REPO_TEMP_PATH` unchanged — push still targets `scripts/temp_info.jsonl`.

### Added

- `getRawFileContent()` in `github-api.js` — fetches large files (> 1 MB) directly from `raw.githubusercontent.com`,
  bypassing the Contents API's base64 size limit. Used as a fallback by the dedup checker.

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

### Planned / proposed

- Firefox (Manifest V3) support
- Keyboard shortcuts via the `commands` API (`Ctrl+Shift+Q` queue, `Ctrl+Shift+,` settings)
- PR-time validation workflow (manifest parse, version-bump check, SPDX header check)

---

[1.0.0]: https://github.com/poli0981/steam-f2p-extension/releases/tag/v1.0.0
[1.1.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.0.0...v1.1.0
[1.2.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.1.0...v1.2.0
[1.2.1]: https://github.com/poli0981/steam-f2p-extension/compare/v1.2.0...v1.2.1
[1.3.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.2.1...v1.3.0
[1.4.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.3.0...v1.4.0
[1.5.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.4.0...v1.5.0
[1.5.1]: https://github.com/poli0981/steam-f2p-extension/compare/v1.5.0...v1.5.1
[1.6.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.5.1...v1.6.0
[1.6.1]: https://github.com/poli0981/steam-f2p-extension/compare/v1.6.0...v1.6.1
[1.7.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.6.1...v1.7.0
[1.8.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.7.0...v1.8.0
[1.9.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.8.0...v1.9.0
[1.10.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.9.0...v1.10.0
[1.11.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.10.0...v1.11.0
[1.12.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.11.0...v1.12.0
[1.13.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.12.0...v1.13.0
[1.14.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.13.0...v1.14.0
[1.14.1]: https://github.com/poli0981/steam-f2p-extension/compare/v1.14.0...v1.14.1
[1.14.2]: https://github.com/poli0981/steam-f2p-extension/compare/v1.14.1...v1.14.2
[1.15.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.14.2...v1.15.0
[1.16.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.15.0...v1.16.0
[1.16.1]: https://github.com/poli0981/steam-f2p-extension/compare/v1.16.0...v1.16.1
[1.16.2]: https://github.com/poli0981/steam-f2p-extension/compare/v1.16.1...v1.16.2
[1.17.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.16.2...v1.17.0
[1.17.1]: https://github.com/poli0981/steam-f2p-extension/compare/v1.17.0...v1.17.1
[1.17.2]: https://github.com/poli0981/steam-f2p-extension/compare/v1.17.1...v1.17.2
[2.0.0]: https://github.com/poli0981/steam-f2p-extension/compare/v1.17.2...v2.0.0
[2.0.1]: https://github.com/poli0981/steam-f2p-extension/compare/v2.0.0...v2.0.1
[2.1.0]: https://github.com/poli0981/steam-f2p-extension/compare/v2.0.1...v2.1.0
[2.2.0]: https://github.com/poli0981/steam-f2p-extension/compare/v2.1.0...v2.2.0
[2.3.0]: https://github.com/poli0981/steam-f2p-extension/compare/v2.2.0...v2.3.0
[2.4.0]: https://github.com/poli0981/steam-f2p-extension/compare/v2.3.0...v2.4.0
[2.5.0]: https://github.com/poli0981/steam-f2p-extension/compare/v2.4.0...v2.5.0
[2.6.0]: https://github.com/poli0981/steam-f2p-extension/compare/v2.5.0...v2.6.0
[Unreleased]: https://github.com/poli0981/steam-f2p-extension/compare/v2.6.0...HEAD