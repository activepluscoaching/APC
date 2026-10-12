# APC — Full Audit & Rebuild Baseline (2026-10-11)

Scope: the master prompt (`APC_Complete_Planning_Document.pdf`), audited against the
repository as it actually stands, plus the live GitHub Pages deployment. Every claim
below is either anchored to a file:line or was reproduced by running the suite.

---

## 1. Repository audit report

### 1.1 State found (before any work in this session)

| Item | Found |
|---|---|
| `origin/main` | `e2c82a3` — **41 files, zero application code** |
| Application entry points on `main` | `index.html`, `admin.html`, `manager.html`, `teacher.html`, `payment.html`, `offline-roles.html` — **all deleted** |
| `js/`, `css/`, `sync/`, `functions/`, `tools/`, `scripts/`, `docs/`, `tests/` | **all deleted** from `main` |
| Second branch | `origin/APC` — intact app (469 files), but 5 builds behind |
| Live site | `https://ajfrinch-ctrl.github.io/apc/` → Pages build `built` from the gutted `main`; `admin.html` verified **HTTP 404** |
| Working branch | restored (see 1.2) |

`main` was emptied by 16 consecutive `Delete …` commits (`2f826f7 Delete index.html`,
`5ad132b Delete js directory`, …, `e2c82a3 Delete scripts directory`), on top of
`3ddc362 Delete the Admin panel and every entry point (build 260)`. The repo's own
history is the recovery source — nothing was lost.

### 1.2 Restored baseline

Build **259** (`552525f`) is the newest commit that still contains the whole application.
It is now the tip of `arena/336529e3-apc` (`fc7810a`), and it is a strict superset of
`origin/APC` plus the newest fixes (`js/staff-overview.js`, the admin-navigation
lifecycle work, the manager teacher-assignment fix, the photoreal login sky, and 7 test
files).

| Restored | count |
|---|---|
| files | 481 (7.3 MB) |
| `js/` modules | 128 files, 33,592 lines |
| `css/` | 19 files, 3,801 lines |
| test files / cases | 202 files, 1,001 cases |
| entry points | 6 HTML pages + `sw.js` + `firebase-messaging-sw.js` + `manifest.json` |
| `firebase.json` | RTDB rules, Firestore rules, Cloud Functions (`functions/`, nodejs22), emulators |

Test result on the restored baseline, before any change in this session:
**1,001 tests — 998 pass, 0 fail, 3 skipped** (`npm test`, 394 s).

### 1.3 What the application actually is (vs. what the master prompt assumed)

| Master prompt assumption | Reality in code |
|---|---|
| "TypeScript + build step required" | **No TypeScript at all** (0 `.ts` files, no `tsconfig.json`). Plain ES modules, no build. Adding TS is a migration decision, not a repair — see §6 D1. |
| "Do not assume Firebase Auth is used until audited" | **It is used.** `sync/cloud-auth.js` signs in against `user.<username>@accounts.activeplus.app` via Firebase Auth, reads custom claims (`role`, `status`, `mustChangePassword`), and awaits `appCheckReady`. |
| "Preserve existing DB paths" | Two generations coexist: live **v1** `activePlusSync/v1/*` (mirrors of localStorage keys) and an undeployed **v2** `activePlusV2/*` with claim-scoped rules (`database.rules.v2.draft.json`) + migration Functions (`adminProvisionV2Identities`, `adminMigrateStudentToV2`, `v2-roster-migration.js`, `teacher-assignment-migration.js`). |
| "Admin panel must be rebuilt" | Admin already has `js/admin.js` + `js/admin-panel-ui.js` + `js/staff-management.js` + `js/staff-overview.js` + `js/admin-academics.js` with a capability layer (`js/admin-permissions.js`). A *replace-everything* rebuild would discard the parts that already satisfy §6. Recommended: keep the shell, re-cut the IA (see §5 Stage 2). |
| "First-admin bootstrap must be protected" | Already server-side: `functions/index.js:75 createFirstAdmin` (claims `role:'admin'`, refuses when initialised). The prompt's concern is about the *client* decision path — see bug B4. |
| README: "সব ডেটা লোকাল ডিভাইসে থাকে — কোনো সার্ভার বা API-এর উপর নির্ভর করে না" | **Stale.** The app is local-first *with* a Firebase mirror (`js/realtime-sync.js`, 1,326 lines) and Auth-backed cloud identity. README must be corrected. |

Offline layer as built: `js/offline-role-store.js`, `js/storage/migration.js`,
`sync/sync-core.js`, `sync/sync-queue.js`, `sync/sync-retry.js`, `sync/sync-guard.js`,
`sync/sync-status.js` (the latter four are thin — 3–32 lines each — i.e. the queue is
close to a stub, see B5).

---

## 2. Bugs, with root causes

### 2.1 Fixed in this session (each guarded by a test)

Source: `ACADEMICS-ASSIGNMENT-AUDIT-2026-10-11.md` (findings-only audit; nothing had
been changed). All five are the master prompt's §6.3 "critical teacher-assignment fix"
chain — the admin saves an assignment, and the teacher either cannot get it or the row
is unfixable afterwards.

| ID | Root cause | Fix | Proof |
|---|---|---|---|
| **F1** | `js/teacher-assignments.js:138` validated the **class name against the SUBJECT list** (`loadAcademics().subjects`), then against the 12 hardcoded `enabledClasses`. An Admin-created class is in neither → every save for it failed `শ্রেণি যাচাই করুন।` | validate against `enabledClasses ∪ loadAcademics().classes` | test `F1` (fails on old code, passes on new) |
| **F2** | The duplicate rule excluded `item.id !== id`, and the Manager form never passed an `id` → editing an existing row was impossible; the only path that "worked" (disjoint subjects) hit `records[index] = next` and **silently destroyed** the row's subjects | row resolved up front; an explicit `id` edits (replace allowed, idempotent); a nameless save never rewrites a row — it is refused with a message pointing at the edit action; Manager form now carries `editingAssignmentId` and an **সম্পাদনা** action per row | tests `F2`, `the Manager form drives the row id…` |
| **F3** | `isSubjectEnabled` was re-checked for **every** subject on the row on each save, so disabling (or renaming) one subject froze the row: individual subjects could no longer be removed | subjects already on the target row are legacy-tolerant; only genuinely new subjects must be enabled | test `F3` |
| **F4** | `readAssignments()` threw for the **whole store** if any row's `className` matched neither `enabledClasses` nor the class list (strict `===`), so a rename or a hand-edited row bricked the Manager teachers view and the Teacher panel | read path validates structure only; class existence is a write/display concern | test `F4` |
| **F5 / F11-read** | `allocateSubjectCode` returned the master-list code (`ICT`) **before** consulting used codes — and `আইসিটি` and `তথ্য ও যোগাযোগ প্রযুক্তি` share that entry; `subjectCodeFor`/`classCodeFor` allocated against `[]`, ignoring every code in use | master code used only while free, else numbered variant; the read-path fallback allocates against the full list | test `F5` |

No behaviour was weakened: `requireManagerSession()`, the Admin-only Academic-Setup
writes, and the capability layer are untouched.

### 2.2 Still open — highest impact first

| ID | Where | Problem |
|---|---|---|
| **B1** | `database.rules.json` (the file `firebase.json` deploys) | Rules are `auth != null` ⇒ **read + write everything**: `students`, `transactions` (payments), `settings`, `teacherAssignments`, `academics`, `examDb`, `staffDirectory`, and `system.adminInitialized`. Any signed-in **student** can rewrite payments and can flip `adminInitialized` back to `false`, re-opening first-admin. `staffAccounts.$role` `.validate` *requires* a `password` child — a credential field in RTDB, readable by every authenticated user. This violates master prompt §5.1, §12.7, §20.13. |
| **B2** | `database.rules.v2.draft.json` | The correct, claim-scoped ruleset exists but is a **draft**: not referenced by `firebase.json`, so it is not what a deploy ships. §12.7's invalid-`newData`-in-`.read` pattern is absent from both files (verified), so this is about deployment + migration, not rule syntax. |
| **B3** | `js/login.js`, `js/realtime-sync.js` | §12.5 admin-initialisation: the client still consults local flags to decide whether the system has an Admin. Needs an explicit "ask the server, then show bootstrap" path with the existing `createFirstAdmin` guard, never "no localStorage key ⇒ no admin". |
| **B4** | `sync/sync-queue.js` (5 lines), `sync-retry.js` (3), `sync-status.js` (1) | The offline write queue is effectively a stub while `js/realtime-sync.js` carries the logic. §12.4 (stable operation ids, no duplicate replay, honest pending state) is not met at the layer the prompt expects. |
| **B5** | `package.json` | No `build`, no `typecheck`, no `lint`. §2.3/§17.3 ("run TypeScript checks, build production assets") cannot be satisfied as written; the only gate is `npm test` + Playwright. |
| **B6** | `tests/` + Playwright | The 2026-10-10 audit recorded **16 passed / 37 failed** e2e on the base commit (pixel/clock assertions). Until that is green, §20.20 "tested in the deployed application" has no automated support. |
| ~~B7~~ **done** | `sw.js:85` | `CACHE_VERSION` 259 → **261** (260 for the assignment-chain set, 261 for the সাজেশন label set) and all 100 `?v=` pins in the six HTML entry points re-pinned, so no client keeps running stale JS after this change set (§16.2). The 40 cache/pin tests pass. |
| **B8** | `README.md` | Documents the pre-Firebase era; §2.2/§13 claims contradict the code (see 1.3). |
| F6–F10 | `js/academics.js`, `js/admin-academics.js`, `js/manager.js` | Open items from the same audit: `loadAcademics()` re-runs the full migration scan on every read (N scans per save); `listMappings` comment vs code; `allocate*(name, [])` elsewhere; busy-guard silently dropping rapid Admin ticks; Admin Setup `render()` wiping in-progress input and resetting a detached node. |

---

## 3. Role workflow map (master prompt §1.4 — drawn before touching code)

```
        ┌──────────────── Admin (system owner) ────────────────┐
        │ create staff (Manager/Teacher/Cash Counter) ── via    │
        │ functions/adminCreateAccount → Firebase Auth uid +   │
        │ claims {role,status,mustChangePassword}              │
        │ Academic Setup: classes · subjects · class↔subject   │
        │ App Control: registration / visibility switches      │
        │ Reports · Activity log · System health · Settings    │
        └───────┬───────────────────────────────┬──────────────┘
                │ assignment (directory row)     │ policy + structure
                ▼                               ▼
   ┌──────────── Manager ────────────┐   ┌──────── Teacher ────────┐
   │ student registration approval   │   │ sees ONLY assigned      │
   │ class/section/session edits       │   │ class+subject rows:     │
   │ Teacher↔class↔subject rows        │   │ store row ∪ directory   │
   │ homework · suggestions · notices  │──▶│ projection (F1–F4 chain)│
   │ routine · exams · results approve │   │ homework/suggestions/   │
   │ reports (fee view within policy)  │   │ question bank/drafts    │
   └───────────────┬───────────────────┘   └───────────┬─────────────┘
                   │ published content                 │ published
                   ▼                                   ▼
        ┌──────────────────── Student panel ────────────────────────┐
        │ login → role from claims (never from username suffix)     │
        │ home: routine · notices · homework · exams · results      │
        │ 3×3 study hub → each icon opens its own route (#hash)     │
        │ own private data only; results only when published        │
        └────────────────────────────────────────────────────────────┘
                   ▲ read-only fee info
        ┌───────────┴──────────── Cash Counter (payment.html) ──────┐
        │ find student → verify → enter amount → summary → confirm  │
        │ one idempotent transaction id → receipt → daily report    │
        │ never edits marks/results; never edits an existing txn    │
        └───────────────────────────────────────────────────────────┘
```

## 4. Permission matrix (what the code enforces today, not what it should)

| Capability | Admin | Manager | Teacher | Cash Counter | Student |
|---|---|---|---|---|---|
| Create/deactivate staff, set claims | ✅ Functions | ❌ | ❌ | ❌ | ❌ |
| Academic Setup (class/subject/mapping) | ✅ | ❌ (reads) | ❌ | ❌ | ❌ |
| Teacher↔class↔subject rows | via directory | ✅ `js/manager.js` | ❌ | ❌ | ❌ |
| Registration approval | policy | ✅ `managerReviewStudent` | ❌ | ❌ | ❌ |
| Homework/suggestions create | ❌ (policy only) | ✅ | ✅ own scope | ❌ | ❌ |
| Publish results | ❌ | ✅ after review | submit marks | ❌ | read own |
| Payment entry | ❌ | review/approve | ❌ | ✅ | ❌ |
| Reports | scoped | scoped | own classes | own day | own data |
| **RTDB rules today** | **`auth!=null` ⇒ everything for everyone** | | | | ⚠️ B1 |

## 5. Staged plan (safe, testable, in order)

| Stage | Work | Exit test |
|---|---|---|
| **0 — stop the bleeding** | Restore build 259 ✅ done; restore `main` (or repoint Pages to this branch) so the five panels answer again; bump `sw.js` `CACHE_VERSION` | `admin.html`/`index.html` HTTP 200 on `github.io`; §18.1 login set passes in a browser |
| **1 — assignment chain** | F1–F5 + build 260/261 cache bump + §8 Teacher সাজেশন workflow ✅ done | `tests/academics-assignment-regressions.test.mjs` + the whole `npm test` green |
| **2 — Admin IA** | §6.1 sections as routes, one page per icon, no stale tab (§6.12), dashboard cards clickable, Staff Management as the only staff surface, Activity Log + System Health wired to real records | §18.2 checklist; `admin-nav-*.test.mjs` extended |
| **3 — security** | Deploy claim-scoped rules (v2 shape, backward-compatible read of v1 paths), remove `password` from `staffAccounts` validation, protect `system.adminInitialized`, per-student own-record rules | Rules simulator + real signed-in role matrix (needs Firebase console access — owner action) |
| **4 — sync truth** | Real queue with operation ids, honest `স্থানীয় / সিঙ্কের অপেক্ষায় / সিঙ্ক হয়েছে / ব্যর্থ` states, listener de-duplication, no form wipes on background updates | §18.7, cross-device §12.8 with two browsers |
| **5 — student hub** | 3×3 hub → dedicated routes (§10.2), unpublished content hidden, results gated on publication, notice read-state | §18.6 |
| **6 — Cash Counter & reports** | Idempotent payment entry, receipt reprint without a second payment, report centre totals from real records, print/PDF and CSV | §18.5 + §14 |
| **7 — e2e + docs** | Repair the 37 failing Playwright specs, then README + `docs/` rewrites; decide TS migration (§6 D1) | `npm run test:e2e:local` all green |

## 6. Decisions the owner must make (blocking, and honest)

- **D1 — TypeScript.** §2.1 mandates TS + a build; §2.3 forbids breaking GitHub Pages. The repo is 33.6k lines of build-free ESM. Options: (a) keep JS and add `checkJs` + `tsconfig` type-checking only (cheap, no runtime risk); (b) full migration (weeks, high regression risk, needs a build/deploy step). Recommendation: (a) now, (b) module by module.
- **D2 — Rules v2 cut-over.** Deploying `database.rules.v2.draft.json` requires the v2 migration Functions to have run for every existing account (claims `teacherId`/`studentId`). Do I prepare the rehearsal, or deploy v1 hardening (kill `password`+`adminInitialized` holes) first?
- **D3 — Push rights.** `main` is publicly broken. Do I open a PR from `arena/336529e3-apc` (restore + fixes), or push directly?
- **C1 — Cannot be verified from this sandbox:** Firebase console settings (App Check token, auth allowed domains, claim backfills), real Android devices, deployed Pages URL, live RTDB contents. No Firebase credentials exist here; §19's "never mark a test as passed unless performed" means items in §18 that need those stay **open**, not ✅.

## 7. Files changed in this session

| File | Change |
|---|---|
| `js/teacher-assignments.js` | F1 class validation; F2 row-id edit + no silent rewrite; F3 legacy-tolerant re-save; F4 read path no longer bricks the store; `addAssignmentSubject` no longer pins `teacher.apc` (F7) |
| `js/manager.js` | Assignment form edit mode (`editingAssignmentId` + id on submit + honest toast wording), per-row সম্পাদনা action, picker preselects the row's subjects, ticks no longer leak across class changes (F2 UI, F8), edit-mode banner with cancel |
| `js/academics.js` | F5 allocator + F11 read-path codes allocate against the live code set |
| `tests/academics-assignment-regressions.test.mjs` | **new** — 6 tests; 5 of them fail on the pre-fix code (verified by stashing the fix) |
| `js/teacher-assignments.js` (§9) | `directoryAssignmentRows` reads every stored shape — `classSubjects` map, `classes`, `classIds`, arrays or comma strings — an empty map no longer suppresses the flat list, and a subject-less class is a valid row |
| `js/staff-management.js` (§9) | Admin's Assigned Class picker = Academic Setup ∪ `enabledClasses` ∪ the record's own classes (`assignableClasses()`), so a Setup class is assignable and an unrelated edit cannot drop a retired one |
| `js/teacher.js` (§9) | আমার ক্লাস → three honest states (pending/failed with retry, genuinely empty, the list) + each class card opens that class in the records screen with the class filter applied |
| `js/report-access.js` (§9) | teacher scope pairs are per subject (NFC-compared) instead of the joined `subject` mirror; an unreadable assignment store degrades to an empty scope with `readFailed` instead of rejecting through `ReportCenter.start` |
| `tests/teacher-assigned-classes.test.mjs` | **new** — 6 tests; 5 of them fail on the pre-fix code (verified by stashing the fix) |
| `sw.js` + `admin/index/manager/teacher/payment/offline-roles.html` | build 260 → 262: `CACHE_VERSION` bumped per change set, every `?v=` pin re-pinned |

### Suite results

| Run | result |
|---|---|
| Restored baseline, before any change | 1,001 tests — 998 pass, **0 fail**, 3 skipped |
| After the assignment-chain set | **1,007 tests — 1,004 pass, 0 fail, 3 skipped** (`npm test`, 394 s) |
| After the সাজেশন label set (§8) | **1,012 tests — 1,009 pass, 0 fail, 3 skipped** |
| After the assigned-classes set (§9) | **1,018 tests — 1,015 pass, 0 fail, 3 skipped** (`npm test`, build 262) |
| Focused sets | assignment chain 40/40; new regressions 6/6 (and 5/6 red on pre-fix code); cache/pin 40/40 |
| Playwright e2e | **not run here** — 37 failures are documented as pre-existing/environmental on this base (B6) |

---

## 8. Teacher panel workflow — "সাজেশনে ক্লিক করলে একাডেমিক নোটিশ খোলে" (reported 2026-10-11)

**Not a routing bug.** `js/teacher.js:299` maps `suggestion` → `#teacherRecords` with the
suggestion tab selected, and that is what happened. The screen *told the teacher
otherwise*, because one label was wrong at the source:

```js
/* js/teaching-data.js */
export const ACTIVITY_TYPES = Object.freeze({
  exam:       { label: 'নম্বর ও ফলাফল', … },
  homework:   { label: 'বাড়ির কাজ', … },
  suggestion: { label: 'একাডেমিক নোটিশ', plural: 'একাডেমিক নোটিশ', … },   // ← the bug
  routine:    { label: 'উপস্থিতি ক্লাস', … }
});
```

That `label`/`plural` is the single source for the tab (`teacher.html:80`), the screen
heading (`js/teacher.js:163` sets `#teacherRecordsTitle` from `plural`), the add button
(`:168`), every card chip (`:75`), the paging control ("আরও ৩টি একাডেমিক নোটিশ দেখুন"),
the teacher PDF header (`js/material-pdf.js:18`) — and the **student panel's own
filters and chips** (`js/student-teaching.js:33,84`). The Teacher panel separately owns a
real notice board (`#teacherNotice`, `js/teacher.js:496+`), so the two collided by name.
`js/report-builders.js` also shipped a report titled **"Academic Notice Report"** that
counts `activitiesFor(ctx, ['suggestion'])` — suggestions again wearing a notice label.

**Fix.** Rename the type, not the routing: `ACTIVITY_TYPES.suggestion` → `সাজেশন`;
the home tile subtitle `একাডেমিক নোটিশ` → `বিষয়ভিত্তিক পরামর্শ`; the tab → `সাজেশন`;
the report title → `সাজেশন রিপোর্ট` with its subtitle/tile relabelled. The report's
`id` stays `teacher.academic-notice` on purpose (stable identifier — stored report
selections keep working; §15.1).

**Proof.** `tests/teacher-suggestion-workflow.test.mjs` — 5 tests on the real
`teacher.html` in jsdom: the tile opens records with the suggestion tab selected, the
heading reads `সাজেশন`, the add button `+ সাজেশন`, the card chip `সাজেশন`, **no "নোটি"
substring anywhere on that screen**, the notice tile still opens `#teacherNotice` alone,
and a source-level guard fails if `একাডেমিক নোটিশ` returns to any shipped entry point.
4 of the 5 fail against the pre-fix code (verified by stashing the fix).

---

## 9. Teacher panel — "একাধিক ক্লাস অ্যাসাইন করা হয়েছে, প্যানেলে দেখা যায় না" (reported 2026-10-11, fixed in build 262)

**Symptom.** After logging in with the teacher's own ID, classes assigned by Admin/Manager
were missing from Teacher Panel → আমার ক্লাস: only one of several classes appeared, or the
panel said `এখনো কোনো ক্লাস অ্যাসাইন করা হয়নি` while the classes did exist.

**Diagnosis — five links of one chain, each independently enough to hide a class.** Static
reading was exhausted before any of this was touched; every claim below is the behaviour an
executed repro showed.

1. `js/staff-management.js` — the Admin's **Assigned Class** picker was built from
   `enabledClasses`, the 12 shipped classes (অষ্টম … অনার্স ৪র্থ বর্ষ). A class the Admin
   created in Academic Setup — ষষ্ঠ শ্রেণি, সপ্তম শ্রেণি, any custom batch — was **not in the
   option list**, so it could never be assigned however many times the form was saved. The
   Manager's picker already read the Setup (F1); the Admin's never did.
2. `js/teacher-assignments.js` → `directoryAssignmentRows()` (the projection that turns a
   Staff Directory record into the rows the panel reads) required a **non-empty flat subject
   list**: `if (classes.length && flat.length)`. Assign three classes and tick no subject and
   the projection answered **zero rows** — a whole teacher, invisible.
3. The same function understood `assignment.classSubjects` **or** `classes`, never both: a
   map covering two of three classes lost the third; and because
   `js/staff-directory.js` writes `classSubjects: {}` for every legacy record, an *empty map*
   was read as "the Admin mapped nothing on purpose", discarding the flat `subjects` mirror.
   `classIds` — the key the Academic Setup and the offline role store use for a class — was not
   read at all, so an assignment naming a class by id resolved to nothing.
4. `validSubjectList()` rejected `subjects: []`, so a class-without-subjects row was not merely
   dropped — `readAssignments()` failed the store, hiding **every** class that teacher had.
5. `js/teacher.js` → `renderTeacherClasses()` printed the empty line whenever
   `state.assignments` was empty — including while the load was still running and after a load
   that had **failed**, which is how a slow or unreachable Firebase reads as "no class
   assigned". The cards were also inert `<article>`s: an assigned class could not be opened.

A sixth, adjacent defect surfaced while pinning the fifth: `js/report-access.js` matched a
teacher's report rows against `item.subject`, the *readable mirror* ("গণিত, ইংরেজি"), so any
teacher with two subjects in a class got an empty report — and an unreadable assignment store
threw straight out of `ReportCenter.start`, taking the panel's shell down with it.

**Fix.** No new store, no new field, no migration, no new screen:

- Admin picker: `assignableClasses()` = Academic Setup classes ∪ `enabledClasses`, plus the
  record's own already-assigned classes, so editing a teacher for an unrelated reason can no
  longer silently drop a retired or renamed class.
- `directoryAssignmentRows()`: reads `classSubjects`, `classes`, `classIds`, arrays or
  comma-separated strings, resolves class ids through `classById`, unions the map with the flat
  list, treats an empty map as absent, and emits **one row per class** — subjects optional. The
  `classById` lookup is guarded so an unreadable Academic Setup can never turn classes into
  "none".
- `validSubjectList()`: `subjects` may be empty (structural validity only). The Manager's own
  save rule ("pick at least one subject") is untouched.
- `renderTeacherClasses()`: three honest states — pending/failed (`তথ্য আনা হচ্ছে` +
  `আবার চেষ্টা করুন`, wired to the existing `reload()`), genuinely empty, or the list; the
  failure path repaints the list instead of leaving it stale. Each card carries
  `data-teacher-open-class` and opens that class in the existing records screen with
  `#teacherClassFilter` set — the teacher's own homework / সাজেশন / উপজাতি / পরীক্ষা workflow.
- `actorScope()`: one pair **per subject** (NFC-compared), and a failed store read degrades to
  an empty scope carrying `readFailed` instead of rejecting — nothing is ever widened on failure.

**Not touched, deliberately.** Identity is still the active staff session's Login User ID
(falling back to the device account only when no directory record exists) — `teacher.apc`
itself has no Admin assignment surface because it is not a Directory record, which is by design
and unchanged. The Manager form still saves one class per row (Teacher + Class + Batch), which
is the stored shape, not a bug. Firebase mirroring needed no change: `js/sync-collections.js`
keys rows by `item.id`, and the projected row ids are per class, so all rows mirror — now
asserted by a test rather than assumed. B1 (wide-open RTDB rules) is still open and still the
reason not to write data from the preview.

**Proof.** `tests/teacher-assigned-classes.test.mjs` — 6 tests: the Admin's `<select>` offers
the Setup classes; three assigned classes produce three store rows with their exact per-class
subjects (including the subject-less one) and never leak to `teacher.apc`; seven stored shapes
(all listed above) read back to the same class set with distinct row ids; the rows survive the
`collectionPayload` → `remoteToLocal` Firebase round-trip; the directory record is not narrowed
by the projection; and the real `teacher.html` panel lists all three cards, opens the clicked
class with the filter applied, shows the retry state on a corrupt store instead of "no class",
and shows the empty line only when nothing is assigned. **5 of 6 fail against the pre-fix code**
(verified by stashing the fix). Full suite: see §7 counts — build **262**, all 100 asset pins
re-pinned.
