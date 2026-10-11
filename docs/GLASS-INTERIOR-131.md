# Glass interior — cache 131 (skin on top of the AMOLED release)

The school asked for a glassy interior: the inner pages should read as frosted
panes instead of flat sheets. This is a **material** change only. Authentication,
permissions, persistence, sync, routing, business rules and the PDF/receipt
renderers are untouched, and the AMOLED palette from the same release is
unchanged — the skin is a separate stylesheet that sits on top of it.

## Shape of the change

- **New file: `css/ui-interior.css`**, imported last by `css/design-system.css`
  and precached in `sw.js`. It owns no palette — every value is either a token
  from `css/foundation.css` or a translucent form of one.
- **New tokens** (both themes, in `css/foundation.css`): the glass material
  itself (`--glass-surface/--glass-bar/--glass-strong/--glass-chip`), its rim
  (`--glass-border/--glass-edge`), its shadows (`--glass-shadow`,
  `--glass-shadow-strong`), the blur radii, and the three ambient colours
  (`--ambient-1..3`).
- **Ambient wash.** `body::before` paints three low-contrast colour pools fixed
  to the viewport. Without something behind them, frosted panels have nothing to
  blur and merely look dusty; the portals therefore stop painting their own
  opaque canvas and let the wash show through.
- **Blur budget.** One blur pass per *surface*: the top bar, status bar, bottom
  navigation, cards/tiles/toolbars/form cards, dialogs, toasts and the modal
  backdrop. Rows, chips, avatars, badges and switch tracks get translucency
  only — a long roster must still scroll smoothly on a low-end phone.
- **Primary button.** It stays the one solid accent on the page, with a shallow
  top-down gradient (the existing `--color-primary`) so it reads as pressed
  rather than painted. No new hue was introduced, so the AA contrast work in
  `tests/amoled-theme.test.mjs` still holds.

## Fallbacks (the part that matters for a school app on cheap phones)

- **No blur support** → the `@supports ((-webkit-backdrop-filter: blur(1px)) or
  (backdrop-filter: blur(1px)))` guard means the whole glass block never
  applies and the previous solid flat look renders instead. The ambient wash is
  declared outside that guard, but it is only a background layer, so the app is
  never *worse* off than the flat build.
- **Print / PDF** → the entire skin lives inside `@media screen`, so paper keeps
  the flat, ink-friendly document. The report/receipt preview keeps its white
  page (it mirrors the PDF) and the canvas/PDF code is untouched.
- **`prefers-reduced-transparency: reduce`** → ambient layer hidden, blur off,
  flat opaque surfaces back.
- **AMOLED** → the dark glass pane is 5.5 % white over a true-black canvas, so
  the pixels an OLED panel switches off mostly stay off; the rim, not a shadow,
  is what makes a card visible there.

## Naming cleanup in the same commit

The theme switch row went back to a short, stable label — **“গাঢ় থিম”** with
the sub-label “AMOLED কালো — চোখের আরাম ও ব্যাটারি সাশ্রয়” — so tests and
screen readers do not depend on the marketing word of the day; the module
exposes `THEME_LABEL` for any future UI that wants the full name. This is the
label the panels shipped before, with the AMOLED explanation underneath.

## Verification

- `npm test` — **595 pass, 0 fail.** Two guards were updated on purpose:
  `tests/amoled-theme.test.mjs` gained the glass-skin rules (screen-only,
  `@supports` guard present, wash declared outside it, reduced-transparency
  fallback, skin loads last, AMOLED pane/rim alpha budget) and
  `tests/minimal-ui.test.mjs` now allows gradients and blur **only** in
  `css/ui-interior.css`, still failing on the legacy aurora/glass theme names
  and on any other sheet growing a gradient or a blur.
- Browser suite: the glass-sensitive specs (`app-redesign`, `student-record`,
  `admin-navigation`, `fixed-shell`, `minimal-workflows`) were run against the
  skin; the standing flakes that fail on `main` in this checkout
  (`admin-navigation` footer background-image assertion, `fixed-shell`
  timeouts) were already failing before this work and are unaffected by it.
- Screenshots reviewed at 390 px for student home, admin dashboard and login,
  in both light and AMOLED, plus 1280 px admin. Not deployed.

Browser command in this sandbox:

```
LD_LIBRARY_PATH=/tmp/apc-browser-libs/lib CHROMIUM_EXECUTABLE=/tmp/chromium npx playwright test
```
