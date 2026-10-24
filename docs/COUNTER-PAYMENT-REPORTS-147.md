# Counter phone lookup, running Transaction IDs and private payment reports — 147

## Latest scope

The owner explicitly adds student/guardian mobile lookup, running payment Transaction IDs such as `T26001`, and all payment-related reports. Reports must protect personal information; whenever phones are necessary their central three digits must be `***`. This supersedes 146’s no-phone-lookup/no-report counter restriction, not its minimal today-default screen, role guard, pending approval or monochrome offline receipt.

## Phone lookup and masks

- Universal search supports names, existing Student IDs/unique rolls **and exact student/guardian phones**. Bengali digits, punctuation/spaces and Bangladesh `+880`/`880` forms normalise to the national number.
- Phone queries return identity plus **masked** contacts, not raw contacts. Name/ID/roll queries remain identity-only. Partial phone prefixes do not enumerate contacts.
- `01712345678` → **`0171***5678`**; `01898765432` → **`0189***5432`**. Exactly the central three national digits are masked. Invalid/missing numbers produce a dash, never an unmasked fallback.
- Selecting a result clears the entered phone query. Neither a hidden form/attribute nor a report scope/filename retains that query as a displayed identifier.
- Reports omit phones by default. The explicit “প্রয়োজন হলে মাস্ক করা মোবাইল দেখান” option includes only masked student/guardian contacts. The same safe tables supply readable HTML, PDF and formula-safe UTF-8 CSV.

## Running public Transaction ID

- New counter and Admin payment entries allocate a public `transactionNo` under the **existing transaction-ledger Web Lock**, in the same durable save as the payment.
- Examples: `T26001`, `T26002`, `T26003`… No daily or monthly restart. At 999 the ordinal continues as `T261000`; a new year uses its year prefix (`T27001`).
- Counter activity, receipt/PDF and counter report tables display this public **Transaction ID**. It is not an editable bKash/bank reference; that optional field is labelled separately.
- Existing public/plain legacy IDs set the floor. Idempotent retries keep their first number; failed writes do not consume one; previous ledger rows are not renamed.
- **Technical storage/sync `.id` stays immutable and collision-resistant.** It is separate from the display ID so two independent devices cannot overwrite financial rows by creating the same short serial.
- As with receipt sequencing, this coordinates a shared local ledger/tabs. **Institution-wide public serial uniqueness across independent offline devices still requires a central server allocator.** No global guarantee is claimed. Old legacy entries without a public serial keep their original displayed fallback ID.

The existing daily receipt number remains `RYYMMDDNNN`, no suffix. New payment status remains pending until Manager review.

## Explicit payment-report view

The main counter still defaults to **today’s own transactions**. “পেমেন্ট রিপোর্ট” opens a separate view; the report builder is not dumped into the home screen. Switching views preserves an unsaved simple amount/method draft.

`js/counter-report-data.js` offers **all 20 existing Fee/Cash report types**, through dedicated safe builds:

1. Daily fee collection
2. Weekly fee collection
3. Monthly fee collection
4. Custom-date fee collection
5. Student-wise payment
6. Class-wise collection summary
7. Batch-wise collection summary
8. Due list
9. Due collection
10. Payment transactions
11. Receipt register
12. Payment status
13. Daily counter collection
14. Counter-wise collection summary
15. Payment history
16. Pending approval
17. Approved payments
18. Rejected payments
19. Counter closing
20. Own counter history

These explicit reports may cover selected periods/all payment records under the latest authorisation. Own-history stays pinned to this counter. No generic student profile, academic or staff report catalog is mounted on the counter.

- Reports use only financial/identity columns. Guardian names, addresses, secrets, free-text private notes and personal profile fields are omitted.
- Class/batch reports are aggregate financial summaries, not student biographies.
- Due/status reports use actual configured monthly fees and approved tuition only. Unknown fees are flagged, never replaced with guessed default amounts. Due collection separates opening dues, approved collection and closing dues.
- Pending/rejected money is not falsely counted as approved collection. Closing reports do not invent expenses/opening cash balances absent from this ledger.
- Inclusive date ranges, fixed-status report types, selected students and source corruption are validated.
- Mobile preview uses readable financial cards/tables rather than a tiny whole-A4 image; PDF uses the same safe data with the existing measured report engine. CSV escapes formula-bearing user-controlled names.
- Ended/other-role sessions cannot generate/export, and counter lockdown clears generated report data/Blob and query results.

## Verification

- Final full Node suite: **688/688 passed**.
- Final native Chromium acceptance across nine specs: **107/107 passed**.
- New serial tests cover continued day/month ordinals, year prefixes, >999, existing numbers, idempotency, durable-write failure and forged caller IDs.
- New report tests cover all 20 catalog IDs, every safe payload/CSV, exact three-digit masks, mandatory selections/date validation, approved-vs-pending math, unknown fees, own-history scope, role guard, corruption and CSV formula injection.
- Native tests at 320px dark, 390px light and desktop exercise actual masked phone results, preview, canvas text, PDF/CSV downloads, no raw PII, concurrent tabs, next-day T serials, unsaved drafts and a cold offline PWA reload after HTTP-cache clearing.
- Previous home-fit, Today-class publishing, other-panel menus/layouts, icons, address-once and offline monochrome receipts remain green.
- Service worker/six entry versions are **147**, including the new privacy/report modules; `git diff --check` is clean.

## Boundaries and samples

**Full server-level per-user isolation is still not implemented.** The shared device storage and interim anonymous cloud bridge retain the limitations documented in 146. This delivery protects counter API/UI/export contents; it does not claim to secure the whole device/devtools or replace authenticated server RBAC. No cloud rules/auth deployment or backend repair was made.

[Screen gallery](../preview/counter-147/index.html), [synthetic receipt](../preview/counter-147/R261001001.pdf), [masked report PDF](../preview/counter-147/masked-payment-report.pdf), and [masked CSV](../preview/counter-147/masked-payment-report.csv). They use clearly named synthetic students, not real transactions. Actual UI generated the receipt/report while offline. Reproduce with `tools/capture-counter-reports.cjs` and a local app server.

The implementation and validation above were completed locally. This session branch is now being submitted as a pull request for review. No production deployment or backend repair is part of this delivery.
