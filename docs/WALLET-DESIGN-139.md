# Active Plus — full wallet-style redesign (139)

Delivered 1 October 2026. This redesign changes the existing app, not a separate wallet prototype. Active Plus's blue/green identity is retained; service grids, round icons, floating summaries, sheet dialogs and prominent primary actions take inspiration from wallet apps. It does **not** implement a bKash gateway.

## Review the delivery

- **[All-panel design gallery](../preview/wallet-139/index.html)**: 29 screenshots captured from the real app in disposable, explicitly synthetic test contexts. Choose home, inner pages, forms/receipts or desktop, then light/AMOLED and a panel. Screenshots are not interactive substitutes for the app.
- **[Actual app](../index.html)**: the same login, accounts and device-bound sessions as before. Protected staff portals still require their own roles.
- Screenshots can be reproduced with `node tools/capture-wallet.cjs` after starting the app on port 8000. Optional `CHROMIUM_EXECUTABLE` selects an installed browser; `APC_PREVIEW_URL` changes the local test origin. `CAPTURE_ONLY=payment:receipt:dark:320` captures one scene.

## Implemented across all five portals

| Portal | Redesign and working entrances |
| --- | --- |
| Student | Identity hero and live homework progress; eight real service shortcuts; existing five-tab navigation with raised routine action; routine, study, exams, results, profile and edit/recovery sheets. Homework opens its existing filter; notices opens the same bell inbox; fees displays the existing information or an honest empty-data message. Optional-module settings also apply to the new tiles. |
| Admin | Welcome/dashboard hero, four live metrics, capability-generated service grid, consistent inner-page back controls, staff/student lists and forms, reports, More, roles, settings, profile and dialogs. Existing permissions continue generating the available services. |
| Manager | Six live overview metrics, eight routed services, four-item navigation, consistent module headings/back controls, approval/class/teacher/finance/routine/exam/report pages and icon-list More menu. |
| Teacher | Assigned-class overview and live summary, eight routed services, five-item navigation, assignment-gated quick actions, homework/classes/exams/records/report screens and round-icon More menu. No assignment or academic records are automatically seeded in production. |
| Payment | Collection summary, three-step search/amount/receipt indicator, five wired section shortcuts, sticky brand header, search/profile/keypad/method/form styling, collect action above the raised navigation action, activity/reports/settings and receipt/password sheets. |

Shared: responsive phone/tablet/desktop layouts, the same uncluttered two-action appbar, centrally declared palette, true-black AMOLED canvas, readable field sizes, keyboard focus/trapping/return, reduced-motion/transparency fallbacks and screen-only visual overrides. Receipt previews stay white paper in both themes; canvas/PDF receipt generation is unchanged. Long receipt IDs wrap in the phone preview and transient status messages remain within the viewport.

## Architecture and preservation

`css/design-system.css` is still the single stylesheet entry. It loads the existing structural/feature sheets and **one final skin**, `css/ui-wallet.css`. Unused glass/modern/notebook overlays are no longer imported. Their source files remain available; the offline shell no longer depends on the unused glass skin.

Wallet colour tokens live in `css/foundation.css`; the skin does not declare another palette. Versioned HTML assets and the service-worker cache move together from 138 to **139**, with the new skin precached. No user storage is cleared or migrated by the redesign.

Presentation-only JS additions:

- Student shortcuts and optional-module consistency in `js/main.js`.
- Payment section navigation and a visual step indicator in `js/payment.js`; no changes to ledger writes, receipt numbering, collection validation or manager approval rules.
- Shared dialog focus return handles feature forms that synchronously focus a field before the mutation observer sees the opened dialog.

No edits were made to the Firebase/sync implementation, finance repository, receipt/PDF renderer, academic repositories or production authentication/permission rules. A new counter entry remains **pending** until Manager review; it is stored durably before a receipt opens and does not reduce approved dues in the meantime.

## Verification

Final runs on the delivered code:

- `npm test` — **620 passed, 0 failed**.
- Chromium Playwright acceptance — **79 passed, 0 failed**:
  ```sh
  npx playwright test tests/wallet-design.spec.cjs tests/app-redesign.spec.cjs \
    tests/student-record.spec.cjs tests/admin-mobile-acceptance.spec.cjs
  ```
  Includes all five portals at 320/390/1280px in light and AMOLED, secondary staff screens, student/manager/teacher shortcuts, both payment save/receipt/PDF flows, pending-approval invariants, long receipt IDs, toast bounds, contained scrollable filters, keyboard dialog close/focus return, short landscape views and a genuine service-worker-cached offline reload.
- Wallet token checks verify AA text contrast for hero, cards, status labels and printable receipt paper; non-text contrast for the raised SVG action.
- `git diff --check` — clean.

The complete historical Playwright suite was **not** asserted green. The 79 tests above are the targeted acceptance run; the full Node suite was run. Visual expectations were updated to the new single skin and intentional scrollable filters. The admin layout fixture uses the same existing role-session helper as other portal specs rather than depending on a live Firebase first-admin setup. Dedicated first-admin/auth tests remain in the full Node suite. One pre-existing 40ms MCQ-save timing race was changed to wait for the actual durable record; the original marks/storage assertions are unchanged.

## Deployment and connectivity boundary

This is a tested local/repository delivery. It has **not** been committed, pushed or deployed to a production site as part of this request.

The preview environment displays a Firebase sync warning. It is deliberately not hidden or replaced with a false success indicator. Cloud authentication/connectivity needs separate environment verification; this visual redesign does not claim to repair or certify the Firebase backend. The gallery uses synthetic sample records, never the user's stored accounts or production data.
