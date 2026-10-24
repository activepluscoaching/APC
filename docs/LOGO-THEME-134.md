# Logo background follows the theme — cache 134

The brand mark was a white-paper PNG: on the AMOLED canvas that baked-in plate
glared, and the old `filter: brightness(.94)` treatment only dimmed it. The logo
is now theme-aware.

## What changed

- **`assets/icons/logo-128.png` is transparent (RGBA) now.** The original
  artwork was painted on white; every pixel was un-premultiplied against that
  white, so the strokes keep their true colour and their soft anti-aliased
  edges, and the plate is simply gone. Same drawing, same 128×128 canvas.
- **`assets/icons/logo-128-dark.png` is new.** The same drawing re-inked for a
  black canvas: the brush "A" becomes near-white (`#f1f4f9`), the ring a lifted
  green (`#45ce8e`), the plus a lifted red (`#ff7b80`). Alpha is shared with the
  light file, so the two are pixel-aligned and swapping cannot shift a layout.
- **`js/theme-logos.js`** (classic script, loaded right after
  `js/appearance-boot.js` in every panel's `<head>`) reads the same stored theme
  key, swaps every `logo-128` image before the first paint, follows the live
  `apc:theme` event, re-paints on `pageshow`, and exposes
  `window.apcThemeLogos()` for images created later — the launch screen and the
  install toast both build their `<img>` after load. A blocked `localStorage`
  (private mode) leaves the light artwork in place instead of throwing.
- **The `filter: brightness(.94)` rule is deleted** — it was the workaround this
  replaces.
- **`sw.js` precaches both files** and `CACHE_VERSION` moves to 134 with the
  `?v=134` pins, so no device keeps the opaque plate from its old cache.

## What deliberately did not change

- **`assets/icons/app-logo.png` (and the PDF renderers)** — reports, receipts and
  exam papers sit on white paper. Those keep the original artwork; the theme
  swap is for the screen, not for the document.
- **App icons / manifest / maskable icons** — the installed-app icon is OS
  chrome, not app UI; it keeps its own artwork.
- Sizes, positions, `alt` text and layout geometry are untouched: the swap is a
  `src` change between two identically shaped files.

## Verification

- `npm test` — **602 pass, 0 fail**, including the new
  `tests/theme-logos.test.mjs` (first-paint choice from storage, live two-way
  swap, late-created logos, non-logo images untouched, blocked-storage
  fallback) and the file-level guards in `tests/amoled-theme.test.mjs` (both
  files RGBA and 128×128, the swapper is wired into every page before
  `</head>`, both files precached).
- Browser: login screen and student topbar screenshots in both themes
  (`preview/logo-login-light.png`, `preview/logo-login-amoled.png`,
  `preview/logo-topbar-light.png`, `preview/logo-topbar-amoled.png`).
- Not deployed.
