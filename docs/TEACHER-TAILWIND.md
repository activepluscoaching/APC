# Teacher panel on Tailwind (2026-10-21)

The teacher panel (`teacher.html`) is styled by one Tailwind build,
`css/teacher-panel.css`. The old 1,300-line inline `<style>` block is gone; the
page now links the compiled sheet after the canonical fifteen stylesheets.

## Files

| File | Role |
| --- | --- |
| `tailwind.config.cjs` | The build config. Teacher-only content paths, preflight off, `important: '.teacher-reference'`, palette tokens as theme colours. |
| `css/tailwind/teacher.src.css` | The authored source: `@tailwind` layers, the teacher component layer (`@apply` + token-backed gradients/blur), and the deep-screen component rules. |
| `css/teacher-panel.css` | The compiled, minified sheet. **Committed**, because GitHub Pages serves static files with no build step. |
| `tests/teacher-panel-tailwind.test.mjs` | Locks the scope, the hero structure, and that the committed sheet equals a fresh build. |

## Build

```bash
npm run build:teacher-css     # tailwindcss -c tailwind.config.cjs -i css/tailwind/teacher.src.css -o css/teacher-panel.css --minify
```

Run it after editing `teacher.html`, `js/teacher.js` (render templates) or the
source sheet, and commit the regenerated `css/teacher-panel.css`.
`tests/teacher-panel-tailwind.test.mjs` fails when the committed file drifts
from the build.

## Scope guarantees

* `important: '.teacher-reference'` prefixes every utility with the body class
  only `teacher.html` carries, so the sheet cannot style the student, admin,
  manager or payment portals even if it were linked from them
  (`tests/panel-isolation.test.mjs` keeps that class on one page).
* `preflight: false`: the shared fifteen-sheet cascade keeps ownership of the
  global reset, typography, form font sizes and the shell geometry (430/520 px
  teacher shell, five dock seats).
* Every colour is a `css/foundation.css` token, so the light and AMOLED themes
  come from this single build — no second palette.

## Home hero

The owner asked (2026-10-21) for the hero to *be* the picture:

* no gradient card behind the artwork — `.teacher-home-intro` is the image
  window itself (`overflow: hidden`, `aspect-ratio: 16 / 10`,
  `min-height: var(--t-hero-min-h)`);
* the day/night classroom artwork fills it (`.teacher-hero-scene`, absolutely
  positioned, `object-fit: cover`);
* `স্বাগতম, <teacher name>` plus the daily advice line sit **inside** the picture
  as an in-flow overlay (`.teacher-hero-content`), over a bottom scrim built
  from the `--t-scrim-ink` token so the text stays readable on both the bright
  day scene and the night scene;
* layout of the overlay is written with Tailwind utilities in `teacher.html`
  (flex, gaps, sizes, `text-on-hero`); only gradients, blur, shadows and motion
  live in the component layer.

The identity initial, the day/night glint and the picture swap are still driven
by `js/teacher.js` (`#teacherHomeInitial`, `#teacherHeroGlint`, `#teacherHeroArt`).

## Artwork

`assets/teacher-hero/teacher-hero-day.webp` and `-night.webp` are a matched pair
(828 × 462, 16:10) that `js/teacher.js` swaps at 06:00 / 18:00 Asia/Dhaka.
**Neither illustration contains a sun or a moon** — the old day scene did, so it
showed two suns next to the day/night chip on the card. The chip
(`.teacher-hero-glint`, sun by day → moon by night) is the only celestial
marker; day is sky + clouds, night is stars + city glow. Replacement rules
(size, calm zones, palette) live in `assets/teacher-hero/README.md` and are
locked by `tests/teacher-panel-tailwind.test.mjs`.

## Screen refresh (ক্লাস / পরীক্ষা / আরও)

The three seats that are reached from the bottom dock were redesigned in the
same scoped sheet (section 24 of the source), keeping every route, id and class
the router and the locked tests use:

* **ক্লাস** — the screen opens with a three-tab segmented bar: **ক্লাস ও বিষয়**
  (the class list itself, first tab, selected by default), **রুটিন ও সময়সূচি**
  and **একাডেমিক কার্যক্রম** (each a tab that opens its own screen). The two
  doors never share one card grid again. Every class is one
  **collapsed disclosure row**: the summary shows only the class, its group and
  the subject/student counts, with a count chip beside the section heading. The
  subject list, the approved-student count and the "এই ক্লাসের কাজ দেখুন"
  action appear only when the row is tapped (`<details>`/`<summary>`, closed by
  default). No primary information lies open (owner order 2026-10-21).
* **পরীক্ষা** — one primary gradient action (দ্রুত MCQ), one quiet dashed
  secondary action, and the four section doors as a 2×2 grid instead of a chip
  scroller; the approval note reads as an info card.
* **আরও** — a single grouped settings list (icon disc, label, chevron) rather
  than a two-tile grid.

