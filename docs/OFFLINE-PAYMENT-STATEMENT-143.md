# Offline, monochrome payment statements — 143

## Requested result

Payment-slip PDFs show the institution address once and read like a simple statement, not a dashboard. Use black text on white paper to avoid large coloured/ink-heavy areas. Generate the file on the device, without an online PDF service.

## Implementation

- `js/finance-receipt.js` has an independent document renderer: institution name, a single campus-address block, statement title/status, ordinary label/value rows, amount, reference, notes, collector and signature.
- The PDF/PNG omit the promotional tagline altogether. This avoids repeating addresses from any saved legacy tagline, including punctuation patterns not covered by the previous cleanup.
- Exact pasted whole-address copies are collapsed in multiline and bullet/pipe/dash/semicolon-separated settings. Original spelling, distinct building/road lines and legitimate repeated city words are preserved. No saved setting is rewritten.
- No logo, outer border, card, coloured badge or filled amount box. The only filled rectangle is white paper; all text is black and rules are thin grayscale lines. Dashboard/theme CSS does not participate in PDF generation.
- Pending/rejected statements retain their actual status and review reason instead of being labelled paid. No approval, amount, authentication, ledger or sync rules are changed.
- Font loading first reads the bundled Bengali font bytes directly from the installed app’s CacheStorage. Statements do not load the logo. The shared brand loader still provides the original logo/font to existing reports.
- The PWA shell now also precaches `js/copy.js`, `js/payment-auth.js` and `js/theme-logos.js`. A cold-offline test exposed these missing entry dependencies after clearing the browser’s HTTP cache; they are required for a genuinely offline reload, not just a previously-open tab.
- The service worker and six HTML entry asset versions are **143**. Existing data is not cleared.

## Offline behaviour

The updated app must first be loaded/installed on the device so its local app files and font are cached. After that, the **first-ever receipt after an offline reload** can be generated and downloaded without Internet, browser HTTP-cache priming or a previous PDF. PDF generation uses the browser’s native canvas/Blob APIs and the repository’s local PDF encoder: no CDN/PDF API, popup or print dialog.

Generating a WhatsApp PNG is also offline; sending it through WhatsApp still uses that service’s own connectivity. Already downloaded older PDFs are unchanged; reload the updated app and download a new statement.

## Validation

- The new statement tests failed against the old implementation (7 failures / 1 pass) before the renderer was changed.
- Final full Node suite: **647/647 passed**.
- Final native Chromium acceptance: **8/8 passed**, including:
  - first PDF and PNG after clearing HTTP cache, switching Internet off and reloading the installed PWA;
  - the actual 320px dark counter flow: offline search, save a pending payment, click PDF download, unchanged stored payment/status;
  - three legacy address variants in HTML/PDF/PNG;
  - existing 320px dark and 390px light counter save/download flows;
  - existing offline app-shell reload.
- A font-constructor trace delegates to real FontFace and verifies cached binary data. Canvas traces delegate to real native drawing and verify one address, black-only text, no logo/border/cards and a real glyph gap below the address.
- The JPEG actually embedded in the downloaded PDF is decoded and checked pixel-by-pixel: no coloured pixels. It is mostly white paper. The PDF has one page and one image placement with valid byte streams; PNG has a valid signature.
- Node regressions additionally cover long addresses/IDs/notes/collector names, status/review notes, retries after font-load failure, unchanged settings/transactions and the complete precached local module/entry graph.

## Samples

- [Simple offline statement PDF](../preview/receipt-143/simple-statement-offline.pdf)
- [PNG of the same statement](../preview/receipt-143/simple-statement-offline.png)

Both were made by the actual public PDF/PNG functions **after a cold offline PWA reload** using synthetic data. The visible note says this is a test sample, not a real transaction. Reproduce with a local HTTP server and `tools/capture-receipt.cjs`; the script does not save a transaction.

No production deployment, push or backend repair has been performed.
