# Active Plus Soft 3D

- `book.png`, `calendar.png`, `exam.png`, `wallet.png`: generated with an AI image model for this application. Optimized to 256×256 RGBA, with border-connected white background removed.
- Companion SVGs: AI-assisted vector material treatment of the application's existing semantic silhouettes, built by `tools/build-soft3d-icons.mjs`. They are not claimed to be image-model outputs. Consistent blue/mint palette, rounded forms, upper-left highlights and restrained depth. Compact controls use vectors for readability.
- No institution logo, user photo, QR code or business data is replaced.
- `js/icon-set.js` selects the artwork; `tools/update-soft3d-markup.mjs` updates static fallbacks without replacing buttons or changing routing attributes.
- Assets are local and included in service-worker cache v332. Regenerate companion SVGs with `node tools/build-soft3d-icons.mjs`; update static markup with `node tools/update-soft3d-markup.mjs`.
