# Minimal Education — release 106 follow-up

Date: 2026-09-29. Supersedes release 105 report (archived separately).

## Resolved in this follow-up

1. **Legacy assets physically removed after dependency audit:** 37 obsolete stylesheets (including styles.css) and 35 glass/admin PNGs. No active HTML/JS/worker referenced these assets; old CSS-to-CSS imports were removed together. Git retains history. Compatibility DOM class names are not old visual styles.
2. **Seven entry pages use the new system:** six app pages plus the previously missed `tools/merge-backups.html`. Seven new stylesheets, centralized at `css/design-system.css`.
3. **Diagnostics and notifications:** removed hardcoded inline styles from presentation portions of diagnostic, bootstrap and notification modules. New `js/status-surface.js` and `css/ui-status.css` keep notices in document flow with Bengali font, clear action labels and 44px controls. Notices no longer overlap each other, login controls or bottom navigation. Retry and dismiss behaviors remain.
4. **Uncaught sync failure fixed:** `assertSyncGuard()` was called without awaiting its promise. It is now awaited within the existing try/catch/retry path. This does not alter the guard, Firebase initialization, queue, retry policy or transport.
5. **PWA install blocker fixed:** duplicate URLs in APP_SHELL caused Cache.addAll to reject the entire install. Removed duplicate occurrences, retaining every protected asset; added missing topbar script and new UI assets. **CACHE_VERSION 106**. Worker fetch/update/activation logic unchanged.
6. **Print presentation:** report and receipt colors now share `js/print-tokens.js`. Existing measured coordinates, pagination, data mapping, calculation, font loading and PDF serialization retained. Screen receipts use shared flat components. Empty report text is now exactly “এই filter অনুযায়ী কোনো data পাওয়া যায়নি।”
7. **Accessibility:** shared `js/ui-accessibility.js` adds mobile table cell labels from column headers, dialog naming, Tab containment, focus restoration and Escape via existing close buttons. Missing copy/chat icons replaced with meaningful paths.
8. **Workflow evidence added:** new `tests/minimal-workflows.spec.cjs` exercises current shared-login/session architecture rather than retired demo entry buttons.

## Verification results

- **30/30 browser checks passed:** 24 role-shell/navigation checks at 320, 390, 768, 1280px; six additional workflow checks:
  - SDK fetch failure: no uncaught page error, readable retry status, no login overlap.
  - 60 seeded students: multi-page report, last row retained, actual PDF download, empty filter preview.
  - Teacher: all 30 MCQ templates selectable/applicable, clipboard copy and 30-question sample insertion.
  - Offline: service worker installs; protected assets cached; seeded existing Admin account and sentinel data survive offline reload.
  - Staff dialog: accessible role/name, repeated Tab stays within dialog, Escape closes.
  - Payment: ID search, student selection, collection, durable transaction, receipt modal and actual receipt PDF download.
- **122/122 targeted unit checks passed:** first Admin, account policy, payments, finance, sessions, secure store, offline persistence, exams, MCQ marks, teacher assignments, search, report layout/center/pagination, receipt output, admin shell, protected sync, and static UI audit.
- Static audit now rejects duplicate precache URLs and missing shell files.
- `/firebase/*` and `/sync/*` byte-identical to starting commit; no destructive reset added.
- Changed JavaScript parses; `git diff --check` clean.
- Screenshot inspection: updated Admin status/header/dashboard/nav and mobile receipt. Browser artifacts remain ignored under test-results.

Commands used (sandbox Chromium):

```sh
LD_LIBRARY_PATH=/tmp/al2023/lib CHROMIUM_EXECUTABLE=/tmp/chromium npx playwright test tests/minimal-ui.spec.cjs tests/minimal-workflows.spec.cjs
node --experimental-default-type=module --test --test-force-exit tests/{minimal-ui,sync-protection,reports-ui,report-center-paging,receipt-brand,receipt-whatsapp,report-layout,mcq-marks,first-admin-setup,finance,exams,payment-auth,session,account-policy,teacher-assignments,student-search,secure-store,offline-persistence,payment-desk,admin-panel-shell}.test.mjs
```

## Still not certified — do not treat this as full acceptance

- **Real Firebase connectivity:** sandbox Chromium requests for Firebase app/auth/database SDKs at www.gstatic.com fail with `net::ERR_CONNECTION_CLOSED`. A direct dynamic import reproduces this. No credentials/configuration were changed and no success state was fabricated. Production authentication/cloud recovery/cross-device synchronization need a network-capable environment and authorized production test accounts.
- **Full historical suite is not green.** A full run was stopped after repeated cross-device timeouts. A broader local run excluding cross-device tests also timed out; recorded failures include legacy Student ID expectation, Firebase hardening/notification wire-shape cases and old topbar/deployment assertions. Only the explicitly listed 122 unit tests and 30 browser tests are reported passing. No blanket skipping/weakening of failed functional tests was done. Relevant sprite/CSS-path/empty-copy assertions were migrated to the new presentation contract.
- **Fingerprint login:** there is no existing WebAuthn registration/verification implementation. Secure biometric login is a new authentication feature, not an icon/button: it needs an agreed origin/RP ID, credential enrollment after authenticated login, challenge verification and recovery/revocation policy. It was not simulated or added around existing permission checks.
- **Physical Android/PWA install/keyboard:** tested Chromium responsive viewports and actual service-worker offline reload, not hardware keyboard behavior, OS biometric dialogs or Android install UI. Exhaustive manual QA of every populated manager/teacher/student feature and every modal state remains unfinished.
- **Remaining legacy presentation outside new UI:** service worker's self-contained offline fallback document retains its original minimal inline styles; untouched exam/material PDF renderer details retain existing document styling. No glass/admin PNG or legacy stylesheet remains. These fallbacks are disclosed rather than described as completely redesigned.

The release 105 storage syntax repair remains: removal of an identical accidental module duplication embedded in a regex. No schema, storage-key, account or Student ID format changes were made.
