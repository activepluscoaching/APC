# Active Plus Color — new illustrated SVG set (140)

The owner asked for a genuinely new colourful/illustrated set, rather than the previous line icons placed on coloured circles. This update implements that set in the existing app, across student, admin, manager, teacher and payment.

## Review

- [Updated all-panel preview — 29 real app screenshots](../preview/wallet-140/index.html)
- [Live SVG catalogue — colour artwork and matching compact glyphs](../preview/wallet-140/icons.html)
- [Previous line-icon design for comparison](../preview/wallet-139/index.html)

The app screenshots use explicitly synthetic data in disposable browser contexts. No production accounts, permissions or finance records are changed by the catalogue or capture scripts.

## What is new

**33 layered service illustrations**: home, dashboard, book, classes/board, teacher, team, students/cap, staff/ID card, profile, calendar, clock, exam/clipboard and pencil, MCQ sheet, result/trophy, attendance, notice/megaphone, wallet/banknotes, receipt, reports/chart, data/database, backup/cloud, settings, roles, security/shield, homework/folder, approval, lock, key, phone/app, help, bell, email and contact phone.

They are new multi-shape drawings with filled paper, blue/green objects and restrained gold/violet/coral accents—not the earlier single paths recoloured. Small tabs and controls use simplified matching glyphs so they remain readable at 20–27px and retain the active/idle/raised-action contrast. The catalogue presents 63 compact glyph drawings, with aliases and a small chevron supported by the resolver.

- Original application artwork; no proprietary bKash graphics, third-party icon font/CDN or raster dependency.
- Central light/AMOLED paints in `css/foundation.css`, including navy paper and lifted accents on the true-black theme.
- Larger service artwork with bounds appropriate for 320px phones, normal mobile screens and desktop.
- Distinct artwork for staff, students, teachers, classes, roles and security; these no longer all alias to the same person/book/shield.
- Decorative SVGs remain `aria-hidden`, non-focusable and named by the existing visible control label/ARIA label.

## Source and preservation

- `js/icon-set.js` — named illustration and glyph artwork plus semantic aliases/fallbacks.
- `js/icons.js` — the same `iconMarkup`, `iconElement`, `paintIcon` API, now rendering the new family. Navigation automatically uses a compact glyph; main services use colour artwork.
- `tools/update-icon-markup.mjs` — reproduces the static HTML fallback icons from that same source. It replaces **194** named SVGs across the five portals while preserving parent controls, IDs, routes, labels and event handlers. Dynamic admin grids/menus and feature rows use the existing renderer API.
- `tools/capture-wallet.cjs` — regenerates the updated real-app screenshots. It now waits for the actual login-ready state rather than a fixed timeout before clicking recovery or signing in.

No change to authentication/permission policy, teacher assignment rules, storage schemas, financial calculations, payment approval or receipt/PDF rendering. No new package dependency. The service-worker release and HTML versioned assets are **140**, with `js/icon-set.js` explicitly precached for offline startup.

## Final checks

- `npm test`: **628 passed, 0 failed**.
- Targeted Chromium acceptance: **81 passed, 0 failed**:
  ```sh
  npx playwright test tests/color-icons.spec.cjs tests/wallet-design.spec.cjs \
    tests/app-redesign.spec.cjs tests/student-record.spec.cjs \
    tests/admin-mobile-acceptance.spec.cjs
  ```
- New checks verify actual multicolour fills (not just a CSS label), well-formed/repeatable SVG, central theme tokens, escaped caller attributes and safe unknown/prototype-name fallback, renderer API/event preservation, icon family coverage on every portal and precache/version alignment.
- Browser checks exercise all catalogue drawings natively in light and AMOLED, reject invalid SVG path errors or out-of-viewBox clipping, check 320/390/1280px layouts, verify every portal's colour services and compact navigation, and repeat the existing real save/receipt/PDF/pending-approval/dialog/offline flows.
- The entire historical Playwright suite was not asserted green; the 81 tests above are the targeted run. The full Node suite was run.

As before, the preview's existing Firebase sync warning is not hidden or claimed repaired. This is a tested local/repository update, not a production deployment, new payment gateway or cloud-backend change.
