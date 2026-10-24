# App-wide visual refresh — cache 116

The shared design system now imports `css/app-polish.css` before the scoped
student-record stylesheet. Every portal loads this same system. This release
changes presentation, not authentication, permissions, persistence or sync.
The previous cloud-containment policy is still in effect; this is not a cloud
sync repair or deployment.

## Coverage

- Login, registration steps and recovery forms: consistent spacing, readable
  labels, touch targets, input focus, progress and helper text.
- All dashboards: neutral surfaces, blue accents, unified cards, statistics,
  icons and bottom navigation; light and dark themes.
- Admin: student/staff lists, search/filter controls, staff forms/details,
  settings and secondary sections.
- Manager: operations, finance summaries, assignments, notices/routine forms,
  record detail, profile, bounded scrollable More menu.
- Teacher/student: work cards, progress, classes, exams/options/results,
  profile sections and empty states.
- Payment: corrected document-level two-column CSS that displaced the entire
  portal on desktop; search, amounts/keypad and summary cards.
- Reports and notices: form/preview controls, readable notices and dialogs.
- Report/PDF document coordinates and production business handlers unchanged.

## Verification

- 35 Chromium browser tests passed: 320/390/1280px portal shells, secondary
  screens at 390px dark, registration steps, notification dialog, manager menu,
  seven student-detail viewport/theme cases, PDF reports/receipts, payment,
  MCQ templates, modal keyboard handling, and real offline service-worker
  update preserving local data while caching the new CSS.
- 74 focused Node/DOM regressions passed across admin/manager/teacher/payment,
  reports, login gating, cloud containment and student detail.
- Two outdated report tests were aligned with the existing active CSS file and
  catalogue empty-state text; no report behavior changed to satisfy the tests.
- Browser tests use synthetic local accounts/data, not live Firebase. The whole
  repository suite and all possible data states were not exhaustively tested.
- Local screenshots reviewed for phone, desktop and dark layouts. Not deployed.

Browser command in this sandbox:
`LD_LIBRARY_PATH=/tmp/apc-browser-libs/lib CHROMIUM_EXECUTABLE=/tmp/chromium npx playwright test tests/app-redesign.spec.cjs tests/student-record.spec.cjs tests/minimal-workflows.spec.cjs --grep-invert 'SDK network failure'`

The excluded legacy SDK-failure test assumes cloud retry is visible on the login
page, contrary to the current cloud-containment policy. Dedicated containment
tests cover the shipped behavior. Browser dependencies were extracted from the
installed @sparticuz/chromium archive, not committed to the repository.
