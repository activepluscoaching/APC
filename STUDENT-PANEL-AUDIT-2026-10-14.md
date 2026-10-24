# Student Panel — Full Audit (2026-10-14)

Scope: `index.html` (auth screen + signed-in student shell), its composition
root `js/main.js`, the pre-login boot modules, and the lazy signed-in chunk
(`js/student-features.js`, 15 namespaces over ~47 modules). Audited on branch
`arena/08da5e75-apc` at cache version 321. The live site still runs older
code; this audit describes the branch copy.

Method: static inspection of markup, shell/session code and sync gateways;
cross-checks of routes vs panels vs nav links; accessibility scans over the
parsed DOM; targeted test suites (61 student-focused tests, all passing).
The full suite was last run the same day: 1207 tests, 1204 pass, 0 fail.

## Panel map

- Auth screen: login / registration (5 steps) / first-Admin creation,
  living sky theme (photo per weather state, sun–moon arc, season wash).
- Shell after login: topbar (notifications, logout), hero, service tiles,
  bottom nav with 5 destinations (হোম, পড়াশোনা, রুটিন, পরীক্ষা, আরও).
- 50 view panels: home, notice board, routine family (11), classes family
  (10), study family (courses, homework, suggestion, question bank,
  materials, model test, practice, results), exam family (10), profile,
  my-profile, settings, notification settings, fee, reports.
- Data: own account/student record only; reports mount with
  `panel: 'student'`; cloud gateway reads `students/{uid}` in Firebase mode.

## Verified strengths

- **Session gating is strict.** The app shell stays `hidden` until a real,
  credential-verified session exists; a cached account or a legacy skip
  flag cannot open it. Hash deep-links (`#exams`, `#routine`, …) apply only
  while the shell is visible, and never for pending accounts. Pending
  students see only the pending screen — header, main and nav are hidden.
- **Session storage** uses an encrypted envelope with validity checks;
  invalid records are wiped instead of trusted.
- **Privacy in cloud mode:** a student client reads only its own document
  (`students/{uid}`); the whole roster is never shipped to student devices.
- **Injection hygiene:** zero inline event handlers, `eval` or
  `document.write`; CSP is `script-src 'self'`; user- and admin-authored
  content is rendered through `escapeHtml` (spot-checked in the notice
  board, teaching and exam renderers).
- **Accessibility:** all 189 buttons in `index.html` have an accessible
  name; every image has `alt`; every `aria-labelledby` target exists; no
  duplicate IDs.
- **Routing integrity:** all 50 panels are reachable through the route
  table; `#results` is a documented inbound alias, `exam-practice` is
  reached programmatically from the exam hub (not an orphan).
- **Boot performance:** pre-login boot is ~25 small modules; the signed-in
  surface (~700 KB of source) loads as one lazy chunk in parallel with the
  login form and is precached by the service worker for installed use.
  Sky photos are 29–98 KB, one state fetched per visit.
- **No maintenance debt markers:** no `console.log`, no TODO/FIXME in the
  student surface.

## Findings

### High
None found.

### Medium
1. **`index.html` is a 196 KB monolith** (793 lines) holding all 50 views
   plus hundreds of lines of repeated inline SVG icon artwork. It parses
   fine and is cache-served after first load, but every panel change edits
   the same file and first-visit parse cost keeps growing. Consider
   generating the repeated tile/nav markup from the icon system instead of
   pasting SVG per tile.
2. **Shared-device data residency (legacy local mode).** In the local
   backend mode the whole institution store — including the roster — lives
   in this browser's storage, and profile sync reads it. That is the
   designed one-device model and Firebase mode does not have the issue,
   but on a shared family device a signed-in student session coexists with
   other students' names/IDs at rest. Worth an explicit owner decision.

### Low
3. **Two English labels remain on the home tiles** — "Notice Board" and
   "Instant MCQ অনুশীলন" — amid otherwise fully Bengali tiles.
4. **পরীক্ষা and ফলাফল tiles use the identical `exam` icon**, so the two
   most-tapped destinations are visually indistinguishable; `result`
   artwork already exists in the icon set.
5. **Asset version pinning is inconsistent** in `index.html`: most assets
   carry `?v=321`, but `theme-logos.js` carries `?v=158`,
   `topbar-connectivity.js` carries `?v=25161005-syncborder`, and five
   boot scripts carry none. The service worker precache (cache version)
   governs installed copies, so this is a maintenance trap rather than a
   live bug — one forgotten bump would strand an old file.
6. **15 render-blocking stylesheets (~257 KB unminified)** load before the
   login screen paints. Acceptable on repeat visits (cached), heavy on a
   first visit over slow mobile data.
7. **Zero-count tiles** ("আমার কোর্স ০", "বাড়ির কাজ ০", …) greet a brand-new
   student with a row of zeros; hiding or muting zero counts would read as
   "nothing yet" instead of "nothing, ever".

## Recommendations (in order)

1. Fix the two English labels and give ফলাফল its own icon (minutes,
   zero risk) — findings 3–4.
2. Normalise every asset URL in `index.html` to the release pin, as the
   other four portals already do — finding 5.
3. Mute zero counts on home tiles — finding 7.
4. When the panel next grows, generate repeated tile/nav markup from
   `js/icons.js` instead of inline SVG — finding 1.
5. Record an explicit decision on shared-device data residency —
   finding 2.

Re-audit trigger: any change to `js/shell.js` session gating,
`js/storage.js` session records, or the sync gateways in `sync/`.

---

## Resolution — 2026-10-14 (same day)

The owner chose the structural fix for Finding 1: **the student panel now
has its own page**, like every other portal.

- `index.html` (794 → 259 lines) ships only the login door: auth screen
  (login / registration / first-admin), password recovery, nothing else.
- New `student.html` (595 lines) ships the signed-in app: `#appShell`, all
  50 views, and the panel overlays (notice centre, logout, resource viewer,
  profile editor, install toast), with `<title>শিক্ষার্থী প্যানেল</title>`.
- `js/main.js` stays the shared composition root and is page-aware: a
  verified student session on `index.html` hands over to `student.html`
  (URL hash preserved), `student.html` without a session returns to
  `index.html`, logout returns to the login door, and the 700 KB
  student-features chunk is only loaded on the panel page. The service
  worker precaches both pages; asset pin bumped to `?v=322`.
- Two latent cross-screen assumptions were found and fixed on the way:
  `js/register.js` wrote to `#pendingStudentId` (now lives on the panel
  page — null-guarded; `shell.js` fills it there), and
  `js/student-dashboard.js` painted its error row without a null check.
- Guarded by `tests/student-page-separation.test.mjs`; the Playwright
  login flows need no changes (a real login lands on `student.html`,
  where `#appShell` lives — one pageshow spec updated).
- Full suite after the change: **1214 tests / 1211 pass / 0 fail /
  3 skipped** (baseline 1207 / 1204).

Still open from the findings above: English tile labels (3), the shared
পরীক্ষা/ফলাফল icon (4), asset-pin oddities in demo-only URLs (5, partly
obsolete), and the shared-device residency decision (2).
