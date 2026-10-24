# More/report organisation — 144

## Issue confirmed

Two report builders were exposed instead of being behind a compact menu:

- Student: `#studentReports` was embedded directly in the profile/“আরও” page.
- Payment: the report card and desk-settings card were always visible. Footer navigation merely scrolled the same long dashboard, so opening “আরও” did not close reports or collection content.

No user screenshot/configuration was supplied; these were reproduced with the actual repository pages and disposable synthetic test sessions.

## Changes

### Student

- “আরও” keeps the existing identity/contact, personal-information, offline-data, installation, theme, security, logout and support actions.
- A named **আমার রিপোর্ট** menu row is near the top, before account settings. It opens a dedicated `#reportsView` with the existing single `#studentReports` mount.
- `#reports` is recognised by the existing student router. The bottom “আরও” remains selected, the explicit Back button returns to `#profile`, and browser Back/reload/deep links work.
- The report builder is not duplicated or rewritten. Own-student report access continues to be enforced by the existing report-access layer.

### Payment

- “আরও” is a dedicated screen with grouped report, theme and password actions. Report and settings cards are closed by default.
- The existing footer and new menu links share one UI-only section selector. Reports open only on request, with a parent Back button; collection/search/activity cards and the sticky collection action are not shown over “আরও”/reports.
- Hidden ancestors preserve an unfinished amount/note form. Switching menus never saves a payment, clears a draft or resets the selection.
- The five footer shortcuts remain; the separate Reports shortcut still works. `/` reopens the visible search screen before focusing it.
- Plain payment-menu Back buttons use blue ink on a light disc, not white hero ink on white paper. Desktop report/More screens do not inherit half-width collection columns.

Admin/Manager/Teacher already keep reports in their own views. Native checks confirmed no report builder leaks into their “আরও” menus. Their existing navigation and capabilities were retained.

Service worker and all six HTML entry asset versions are **144**, preserving the previous complete offline shell, monochrome payment statements, colourful icon set and student-home fit. No settings, ledger, financial approval, authentication or sync implementation was changed.

## Verification

- New Node menu regressions failed **5/5** against the old layout; the fix passed them.
- Final full Node suite: **652/652 passed**.
- Final native Chromium acceptance: **80/80 passed** across six spec files, including **18** new menu/report cases:
  - 320px dark, 390px light and desktop layouts;
  - More/report separation, explicit Back, selected footer, student reload/browser Back;
  - real scoped report generation and PDF downloads for student/counter;
  - preserved unfinished payment amount/note and the search keyboard shortcut;
  - authenticated cold offline PWA reloads after clearing HTTP cache;
  - all five panels’ existing layouts, report menus, screen fit and permissions;
  - previous student empty-home fit and icon rendering;
  - receipt address-once, real offline PDF/PNG and pending counter save/download flows.
- One test setup initially reloaded the student app before asynchronous real login had completed on a busy runner. Waiting for authenticated UI fixed the fixture race; no production login/session guard was relaxed.
- The viewport-wide header background intentionally extends across content gutters. Tests check real controls and text fit rather than incorrectly treating that decorative band as content overflow.

## Preview

[Six-screen gallery](../preview/more-144/index.html) includes student/counter “আরও” and report screens in light/dark themes. The images were captured from the real app using synthetic test contexts. Reproduce with a local HTTP server and `tools/capture-more.cjs`.

No commit, push, production deployment or backend repair has been performed. Sync status messages remain truthful and visible.
