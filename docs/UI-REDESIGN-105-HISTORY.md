# Minimal Education visual release — 2026-09-29

## Status: implementation delivered, full acceptance NOT yet achieved

All six HTML entry points now load the same newly authored presentation system. This is a replacement CSS entry, not an override on Aurora. Existing DOM IDs, form names, routing state classes and permission-driven navigation remain the application/UI boundary. Feature arrangements are shared rather than a functional rewrite.

### Delivery inventory

- **6 entry pages:** index (login + student), admin, manager, teacher, payment, offline-roles. Nested modules are not counted as separate redesigned pages.
- **6 new CSS files:** `css/design-system.css` (entry), `foundation.css` (tokens/type), `ui-layout.css`, `ui-components.css`, `ui-forms.css`, `ui-features.css`.
- **18 old HTML stylesheet links replaced by 6 single-entry links.** Machine-counted inventory: `docs/ui-audit.json`.
- New icons: **`js/icons.js`**, semantic 24px stroked SVG paths and compatibility aliases. Static HTML icons are inlined; dynamically generated content calls this module. No runtime sprite, external icon library, glass PNG, or admin PNG dependency remains in page/JS rendering.
- `js/admin-icons.js` is a deprecated compatibility re-export, not an artwork source.
- SVGs are decorative (`aria-hidden`, nonfocusable). Existing visible button labels and icon-only control aria-labels provide accessible names. Icons themselves are intentionally not extra keyboard stops.
- Default near-white/blue palette; existing persisted dark-mode preference is honored with the same geometry and semantic tokens.
- Navigation: existing permission filtering preserved, up to five primary items. Payment search is ordered before collection summaries.

### Dependency disposition

**A — presentation-only, deprecated:** old `css/aurora.css`, its full import chain, `styles.css`, and old `assets/icons/glass/*` / `assets/icons/admin/*`. Files remain for rollback/history, but no active HTML/CSS chain loads them and the service worker no longer precaches them. No physical asset deletion was necessary. See JSON for complete stylesheet list and removal counts.

**B — mixed visual/functional:** static page markup; dynamic template SVG fragments in main, admin, payment, student-dashboard, notice-center, staff-password-dialog; offline role navigation; admin-panel-ui and staff-management imports. Only icon rendering/imports changed in these modules. Router selectors retained. The new CSS explicitly preserves hidden/active states, modal geometry, form labels, pull-refresh state and measured PDF positioning.

**C — protected:** `/firebase/*`, `/sync/*`, realtime synchronization, auth, permission and financial/exam/report engines. No Firebase/sync source changes. Byte equality against the starting commit is asserted by the new audit test.

### Necessary pre-existing blocker repair

The starting commit's `js/storage.js` could not parse: almost the entire module was duplicated inside the class-roll regex template literal. The identical duplicate was removed and the regex terminator restored. This is the only nonvisual engine repair. ID format, keys, schema, sequence calculation and persistence behavior are unchanged. No migration, reset, account replacement or data deletion was introduced. The original Student ID format also disagrees with one old database test; that test is not concealed or changed.

### Data, Firebase, Sync and PWA

- No `localStorage.clear()`, IndexedDB database deletion, account reset or Firebase reset added.
- Existing keys, IndexedDB schema and role permissions untouched.
- **Service worker `CACHE_VERSION = 105`**; new styles and icon module cached. Existing worker install/fetch/update strategy unchanged.
- All protected Firebase/config/init/services and sync/core/config/auth/queue/retry/status/guard assets remain cached, as does realtime-sync.
- **Observed live-preview limitation:** Sync Guard reports `firebaseInitialized:false` while config, SyncService, localStorage, queue and retry are available. This was not bypassed or hidden. Real Firebase authentication, recovery and cross-device sync cannot be signed off here.

### Validation actually run

- New static UI audit: **3/3 pass** (single CSS entry, no runtime legacy icons/sprites, no direct Firebase/storage in new icon UI, protected-file byte equality, cache membership, no newly added destructive reset).
- New browser shell/navigation suite: **24/24 pass**. Login, admin, manager, teacher, payment and student at **320 / 390 / 768 / 1280px**. Role shells visible; bottom navigation exercised; no page-level horizontal overflow; no old icon assets/sprites in DOM. These tests do not claim every nested control or long table is fully validated.
- Targeted functional unit suite: **109/109 pass** across first-admin setup, finance, exams, MCQ marks, report engine/layout, payment auth, sessions, account policy, teacher assignments, student search, secure store, offline persistence and sync protection.
- Initial broader run timed out in cross-device sync. Browser suites using retired `#demoLoginButton` and `#teacherEnter` timed out. Full historical suite is NOT green. Earlier database run failed the old Student ID format expectation. Cache-version test updated for release 105.
- `git diff --check`: clean. Changed JS parses.
- Local Chromium screenshots captured for login and all five roles at 390px; login/admin images inspected. Screenshots are ignored test artifacts, not shipped assets. Android hardware/virtual keyboard and full page-by-page manual inspection were not completed.

### Remaining acceptance gaps / legacy presentation

1. Old stylesheet and PNG source files remain deprecated on disk, not runtime dependencies. Some old CSS class names remain because application handlers depend on them; their appearance comes only from the new system.
2. Inline diagnostic UI in existing Firebase/sync/install modules still contains legacy colors, radius and typography, and the visible Firebase failure notice has font/rendering issues. Protected diagnostics were not rewritten or hidden. Therefore “no old visual code anywhere” is **not** met.
3. Report/receipt/PDF engines still own existing inline document branding and measured print geometry. Their logic was deliberately preserved; pixel-level PDF/receipt visual QA remains.
4. Generic shared styling covers feature screens, but all populated long lists, staff dialogs, exam questions, notices, attendance, settings and every responsive empty/loading/error state have not received complete manual QA. Mobile tables need per-column semantic-label coverage review.
5. Fingerprint login was not present in the inspected login implementation; no fake biometric control or new auth mechanism was added.
6. Existing 30-template MCQ data/copy code was not removed or rewritten; browser copy interaction still requires full workflow verification.
7. Browser shell tests provision isolated test accounts through existing APIs, not the user's production accounts. They do not certify production data/cloud synchronization or end-to-end payment/PDF/PWA installation.

## Re-run

```sh
npm test
npm run test:e2e -- tests/minimal-ui.spec.cjs
node --experimental-default-type=module --test tests/minimal-ui.test.mjs
```

In this sandbox Chromium was launched with `CHROMIUM_EXECUTABLE=/tmp/chromium` and `LD_LIBRARY_PATH=/tmp/al2023/lib` (bundled by the existing Sparticuz dev dependency). Preview: port 8000.
