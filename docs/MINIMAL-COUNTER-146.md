# Minimal payment counter — 146

## Explicit scope

The counter shows only today's transactions, no dues or student directory/details. An explicit universal search by name, Student ID or existing unique roll returns a brief identity; payment starts there. Keep the method simple. New display receipts must be exactly `R` + `YYMMDD` + three daily ordinal digits, e.g. **R261001001**, with no suffix. No extra counter features.

## Delivered counter surfaces

- One today's-own-transactions list and one universal search box.
- Removed monthly/today collection dashboard totals, dues/counts, due/recent-student picks, detailed profiles, keypad/quick amounts, sticky collect control, footer tabs, report/history/More pages and number-bearing WhatsApp/copy actions from this role's screen.
- An empty or one-character query never enumerates students. Name (including the stored English spelling), punctuation/Bengali-digit-compatible Student ID and existing `uniqueRoll`/roll aliases are the only match fields. Results are capped at ten.
- Query results and selected brief contain only **name, Student ID and existing unique roll**. Phone, guardian, address, class/group, monthly fee and account status never reach the counter UI's state/results. No new roll is invented.
- Selection is restricted to an actual search result. The simple form uses an empty amount, existing fee-type/month choices, one method select (Cash initially) and optional transaction reference. No guessed due amount or new payment gateway.
- During payment the search card/action are hidden so the same identity is not repeated across multiple cards. Cancel/success clear the selected brief and return to today's screen.
- Today filtering uses the local calendar date, prefers machine timestamps, handles the existing Bengali-date legacy records and restricts entries to this counter (legacy counter label is retained). There is no public date argument to widen the counter API into historical reads. Date rollover refreshes the list.
- The valid counter session is checked before reads/search/save/receipt/PDF. A role lock/session change purges brief identity, query results, today rows and the external receipt dialog, rather than just hiding the main page.

## Data/financial boundary

`js/counter-data.js` is the narrow counter-facing API. Private roster/ledger records are processed internally, never returned as full records to `js/payment.js`. Public receipts use an explicit allowlist even for imported/legacy ledger rows containing extra personal fields. The finance record retains its authoritative class for Manager accounting, but that class is excluded from the counter projection/receipt.

The existing Manager approval contract remains: a new counter entry is **pending**, saved durably before showing a receipt. It never self-approves or settles approved dues prematurely. No stored user configuration or historical receipt was rewritten.

The shared Bengali PDF/PNG engine and report APIs remain available to other roles. Counter PDF is still the address-once, monochrome offline statement, now without the private class row; existing roll is included only when present. Counter UI no longer opens personal-contact chats.

## Exact receipt numbering

The new counter receipt is assigned inside the repository's existing ledger lock and durable write. Today's maximum existing plain or legacy-suffixed receipt ordinal sets the floor. Examples:

- 1 October 2026, first: `R261001001`
- second: `R261001002`
- 2 October, first: `R261002001`

No dash, random bytes or other text is appended. Primary transaction IDs remain collision-resistant, separate from the printed receipt number. Idempotent saves retain the original receipt; failed writes do not print/consume one. At **999/day**, the save is refused rather than silently expanding/changing the requested format.

**Numbering limitation:** the allocation coordinates tabs sharing this device's ledger, as verified with real Web Locks. Independent offline devices cannot guarantee one institution-wide serial sequence without a server allocator. This delivery does not claim that guarantee or rename already-synced duplicates.

## Privacy limitation — important

This delivery minimises the **counter's application surfaces and counter API return values**, not access to the whole shared device or cloud database. The current app stores multiple roles' data in the same origin's localStorage, and the existing interim anonymous RTDB bridge is not per-user RBAC (`docs/INTERIM-ANONYMOUS-SYNC.md`, `docs/RTDB-PER-USER-RULES-PLAN.md`). A person with browser/devtools/storage access can inspect data outside these narrow interfaces.

Therefore the request's absolute “কোনভাবেই” isolation is **not a server-level security guarantee here**. True role separation needs authenticated per-user server rules/endpoints and a separate minimal search index, plus appropriate local-storage separation. No cloud rules, authentication architecture or deployment were changed/claimed by this UI/data-minimisation work. This boundary was explicitly told to the user.

## Verification

- New exact-number regressions before implementation: **1/7 passed, 6 failed**; fixed **7/7**.
- Domain minimisation/validation/role/date tests: **8/8**.
- Final full Node: **673/673 passed**.
- Final native Chromium across eight specs: **97/97 passed**. New counter cases cover 320px dark, 390px light and desktop, no sensitive DOM text, permitted/disallowed query keys, today/old/future/other-counter exclusion, real pending save, exact filename/PDF, midnight rollover, simultaneous tabs, session-end purging and a cold offline PWA reload after HTTP-cache clearing.
- Existing other-panel layout/icons/home-fit/More/routine-publishing tests remain green, as do actual offline monochrome payment PDF/pixel/address checks.
- Previous tests expecting the superseded counter dues, keypad, WhatsApp numbers, footer/report/More surfaces were replaced with explicit new-scope assertions; no business approval/auth assertion was weakened.
- Service worker and six entry asset versions are **146**, including the new counter module. `git diff --check` is clean.

## Samples

[Actual-screen gallery](../preview/counter-146/index.html): today, query identity, simple form and receipt in light/AMOLED. [Exact-format sample PDF](../preview/counter-146/R261001001.pdf) comes from a real synthetic counter save followed by offline generation; it is not a production transaction. Reproduce via `tools/capture-counter.cjs` against a local app server.

No commit, push, production deployment or Firebase backend repair was performed.
