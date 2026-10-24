# AMOLED dark theme — app-wide, cache 131

The user asked for an AMOLED theme (true-black, bright accents, battery
friendly) applied everywhere. This release replaces the previous blue-grey
"dark" palette with the AMOLED one and tunes the components a pure-black canvas
changes the meaning of. Presentation only: authentication, permissions,
persistence, sync, routing and the PDF/receipt renderers are untouched.

## What changed

- **One palette, one place.** `css/foundation.css` now owns the tokens for both
  themes; `css/app-polish.css` no longer redeclares them (it previously carried
  a second dark palette that quietly overrode `--color-bg`, `--color-surface`
  and `--color-primary`). Any future portal change reaches every panel through
  the same variables.
- **AMOLED palette.** Canvas `#000` (the pixels an OLED panel actually switches
  off), cards `#0b0d10`, tiles and inputs `#171a20`, hairline borders
  `#2b303a`, text `#f4f6fa`, primary `#5ea9ff`, status greens/ambers/reds
  brightened for black. Every text/surface pair clears WCAG AA.
- **No shadows on black.** `--shadow-sm` is `none` in AMOLED and
  `--shadow-dialog` becomes one deep `0 24px 70px #000` — a drop shadow is
  invisible on a black canvas and still costs paint on every scroll. Cards and
  bars separate with the borders they already had.
- **Bars stay black.** Top bar, bottom navigation and the admin bottom bar are
  painted with the canvas colour in AMOLED so cards visibly lift off them.
- **Backdrop token.** The modal backdrop moved from a hardcoded
  `#17243866` to `--modal-backdrop`; AMOLED uses `#000000d9`, so a dialog reads
  as a layer instead of floating on a washed-out page.
- **Toasts.** In light mode they invert (dark pill on light page). On black the
  same inversion is a flashlight, so AMOLED paints them as a raised surface with
  a border.
- **Brand mark.** The PNG logo is white-paper artwork; AMOLED dims it 6 %
  (`filter: brightness(.94)`). It is deliberately *not* recoloured — a synthetic
  dark logo would be a worse lie than a slightly dim one.
- **Receipts and reports stay white paper.** `.rc-pdf-preview` keeps its white
  page because it mirrors the printable document; only the gutters around it
  follow the theme. `js/print-tokens.js`, `js/material-pdf.js` and
  `js/exam-pdf.js` are unchanged.
- **Labels.** The profile switch row reads "গাঢ় থিম" with the AMOLED sub-label
  "AMOLED কালো — চোখের আরাম ও ব্যাটারি সাশ্রয়" (a short stable name for tests
  and screen readers; `js/appearance.js` exposes `THEME_LABEL` for the full
  name), and the `theme-color` meta (`#f3f6fb` light / `#000000` dark) follows.
- **Glass interior.** `css/ui-interior.css` (loaded last, screen-only, guarded
  by `@supports`) gives the interior its frosted material — see
  `docs/GLASS-INTERIOR-131.md`.
- **Smaller fixes found on the way.** The student ledger due-amount colour is a
  token now (`var(--color-danger)` instead of `#c05b4b`), and asset version pins
  moved to `?v=131` with `CACHE_VERSION = 131` so every device picks the new
  stylesheet up on the next load.

## Theme choice stays opt-in

The app still starts light on a first run and only an explicit, stored toggle
turns AMOLED on — the existing product rule (`tests/appearance.test.mjs`). The
system colour preference still never switches it on by itself. Making AMOLED the
first-run default is a two-line change (`getTheme()` and `appearance-boot.js`)
plus a rewrite of that product rule; it was not done here because it is a
product decision, not a visual one.

## Verification

- `npm test` — whole Node/DOM suite green, including the new
  `tests/amoled-theme.test.mjs` (canvas is true black, surface ladder, AA
  contrast on black, single-palette rule, flat-selector rule, page `theme-color`
  agreement, backdrop token) and the two cache-version guards, which were
  bumped from 130 to 131 as intended.
- Browser suite (`npx playwright test`) — see the run recorded in the pull
  request; the layouts, PDF/receipt geometry and offline service-worker
  behaviour are unaffected because only colours and shadows moved.
- Local screenshots reviewed for student, admin, manager, teacher, payment,
  login and the profile theme row at 390 px, plus admin at 1280 px, in AMOLED
  and in light. Not deployed.

Browser command in this sandbox (Chromium extracted from
`@sparticuz/chromium`, libraries from its `al2023` archive):

```
LD_LIBRARY_PATH=/tmp/apc-browser-libs/lib CHROMIUM_EXECUTABLE=/tmp/chromium npx playwright test
```
