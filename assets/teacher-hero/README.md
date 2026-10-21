# Teacher Home hero artwork

Two matched 3D claymorphism illustrations of the same classroom corner, used as
the **whole** Home hero card (`.teacher-home-intro` in `css/teacher-panel.css`).
`js/teacher.js` swaps them at 06:00 / 18:00 Asia/Dhaka into `#teacherHeroArt`
and fades the change, so the card follows the time of day offline too.

| File | When | Scene |
| --- | --- | --- |
| `teacher-hero-day.webp` | 06:00–17:59 | Bright classroom: emerald chalkboard with chalk doodles, wide arched window onto a pastel sky with clouds and two birds, desk with an open notebook, textbook stack, plant, pencils. |
| `teacher-hero-night.webp` | 18:00–05:59 | The same corner at night: same chalkboard and desk, window onto a deep indigo sky with twinkling stars and blurred city lights, a warm brass desk lamp glowing on the wood. |

## Rules for any future replacement

* **Size:** 16:10 landscape, exported at **828 × 462** WebP (quality ≈ 84).
  The card crops with `object-fit: cover; object-position: center 46%`, so the
  desk/table must stay in the lower third — that is where the greeting and the
  daily line are drawn over a scrim (`--t-scrim-ink`).
* **No sun and no moon in the artwork.** The owner reported "two suns" when the
  old day scene carried its own sun next to the day/night chip on the card. The
  chip (`.teacher-hero-glint`, sun by day → moon by night) is the *only*
  celestial marker; day is sky + clouds, night is stars + city glow.
* **Keep the upper corners calm** (the identity chip sits top-left, the glint
  top-right) and keep the bottom quarter simple (text sits there).
* Palette: the app's emerald (#0e7a55) / teal / cream / oak wood, warm accents.
