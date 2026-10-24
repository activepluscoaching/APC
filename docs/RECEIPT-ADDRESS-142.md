# Receipt address duplication fix — 142

A saved legacy tagline such as `শিখতে থাকো, এগিয়ে যাও • কলেজ রোড, দিনাজপুর সদর` reproduced the reported duplication: the tagline printed the address, then the separate campus-address row printed it again.

## Fix

`js/finance-receipt.js` formats a shared clean header for the HTML preview, PDF and WhatsApp PNG:

- Removes complete current/default address components from legacy combined taglines (bullet, pipe, dash or newline separators); an address-only tagline falls back to the institution’s slogan.
- Matches address text literally, tolerating whitespace/Unicode differences without interpreting user-supplied regex characters.
- Removes only exact copied full address blocks. Distinct address lines, legitimate repeated place words and ordinary custom slogans remain.
- Leaves saved settings and all transaction fields untouched. No account, ledger, payment-approval or storage migration.
- Adds a measured/tested clear gap between the address and receipt badge. Native Bengali glyph bounds must not overlap.

Cache and six entry-page asset versions are **142** so the new offline receipt module is fetched. Old already-downloaded PDFs do not change; generate/download a fresh PDF after reloading the updated app.

## Validation

- First new legacy-config regression failed against the old renderer, confirming the duplication.
- Full Node run: **636/636 passed**. After the final header-spacing refinement, all affected receipt/finance/payment/WhatsApp tests passed again: **32/32**.
- Final native Chromium run: **5/5 passed** — three real PDF/PNG/HTML variants plus the existing two counter save/pending-approval/receipt/PDF flows.
- Native canvas tracing delegates to real `fillText` and verifies one address draw and non-overlapping glyph bounds. Downloaded PDFs have one page/image placement; PNGs have valid signatures. Test settings remain unchanged.

[Sample PDF](../preview/receipt-142/address-once.pdf) and [PNG](../preview/receipt-142/address-once.png) were generated from the actual app renderer using synthetic data only. The visible note identifies them as a non-transactional test sample.

No production deployment or cloud repair is claimed. Only newly generated receipts use the corrected formatting.
