# Academics → Teacher Assignment — Line-by-Line Audit (2026-10-11)

Scope: the chain the Admin's class/subject setup feeds — `js/academics.js`,
`js/admin-academics.js`, `js/teacher-assignments.js`, and the Manager
assignment form in `js/manager.js` / `manager.html`. Every item below was
either proven with a live repro (script output quoted) or is anchored to
exact code. Findings only — nothing was changed.

## HIGH

### F1 — an Admin-created class can never receive assignments

`js/teacher-assignments.js:138-139` (in `saveTeacherAssignment`):

```js
const known = new Set(loadAcademics().subjects.map(item => subjectKey(item.name)));
if (!clean.className || !known.has(subjectKey(clean.className)) && !enabledClasses.includes(clean.className)) fail('শ্রেণি যাচাই করুন।');
```

The class name is validated against the **subject** list (`.subjects`), then
against the hardcoded `enabledClasses` from `js/config.js`. Admin-created
classes are in neither — so `setClassSubjectByName('সপ্তম শ্রেণি', 'গণিত', true)`
succeeds (the class exists, the mapping exists, the Manager form even lists
it from `listClasses()`), but saving the assignment fails:

```
ASSIGN new class refused: শ্রেণি যাচাই করুন।
```

Only the 12 legacy config classes are assignable. `readAssignments`
(`js/teacher-assignments.js:45`) correctly accepts `loadAcademics().classes`,
so the store and the writer disagree. This breaks the exact workflow
"এডমিনকে ঠিক করতে দিন কোন ক্লাসে কী কী পড়াবে" the Admin Setup exists for.

### F2 — the Manager form cannot edit a row; the one silent "edit" destroys data

`js/teacher-assignments.js:152-154` + `js/manager.js:235-271`:

- The duplicate rule fires on **any subject overlap** with the same
  teacher + class + group row. With `id: ''` (the form never passes an id)
  the row being edited is not excluded, so every sensible resubmit is
  refused.
- A **disjoint** resubmit passes the duplicate check and then
  `records[index] = next` (line 154 + 159) **replaces** the row's subjects.

Repro (same class/group, one teacher):

```
after first save:  [['গণিত','রসায়ন']]
EXTEND refused:    এই Teacher, class/batch ও subject assignment আগে থেকেই আছে।   (old+new)
REDUCE refused:    এই Teacher, class/batch ও subject assignment আগে থেকেই আছে।   (subset)
DISJOINT result:   [['জীববিজ্ঞান']]                                            (old subjects lost)
```

The form cannot show this either: `renderTeacherSubjectPicker` is called
without `selected` (`js/manager.js:271`, `:789`), so an existing row presents
itself as empty ticks. Comment at `js/teacher-assignments.js:121` promises
"Save (or replace)" — replace is only reachable with `id` (used solely by
`deleteAssignmentSubject`) or through the destructive disjoint path.

### F3 — a row freezes the moment Admin disables (or renames) one of its subjects

`js/teacher-assignments.js:144-148` validates `isSubjectEnabled` for **every**
subject in `wanted` on every save — including the re-saves from
`deleteAssignmentSubject` (`:180`) and `addAssignmentSubject`. Repro:

```
row: ['গণিত','রসায়ন'] for নবম শ্রেণি; Admin turns রসায়ন off
DELETE after disable refused: "রসায়ন" বিষয়টি নবম শ্রেণি-এর জন্য চালু নেই …
DELETE whole row still works
```

So a disabled subject locks editing of the whole row: individual subjects can
no longer be removed (only the entire assignment). Renaming a subject has the
same effect, because rows store subject **names**. This contradicts
`selectableSubjects`' `includeLegacy` promise ("plus any legacy value already
on the record, so nothing is stranded", `js/teacher-assignments.js:108-115`).

## MEDIUM

### F4 — one malformed/renamed className bricks the entire assignment store

`js/teacher-assignments.js:45`: `readAssignments` throws for the **whole
store** when any row's `className` is in neither `enabledClasses` nor
`loadAcademics().classes` — compared with strict `===` (the rest of the file
uses `keyOf`). `saveClass` with `id` renames classes
(`js/academics.js:454-471`, no UI yet); rows keep the old name → every read
throws → the Manager teachers view and the Teacher panel fail outright.
Hand-edited or cross-device records hit the same landmine. Nothing deletes
rows, so recovery is manual.

### F5 — duplicate paper codes are guaranteed by the code map

`js/academics.js:57-58` maps both `'আইসিটি'` and `'তথ্য ও যোগাযোগ প্রযুক্তি'` to
`'ICT'`; `allocateSubjectCode` (`js/academics.js:74-77`) returns the known
code **before** consulting the `used` set. Two subjects therefore always
share one exam code, and any future map entry repeating a value does too.

### F6 — every read runs a full migration scan

`js/academics.js:316-322`: `loadAcademics()` runs `migrate()` on every call,
and `migrate` scans `observedPairs()` + `observedChapters()`
(`js/academics.js:163-181`, `192-220`) — up to five `JSON.parse`s of the
assignments/exams/teaching/course stores. Every `listClasses`,
`subjectsForClass`, `isSubjectEnabled` call pays that cost;
`saveTeacherAssignment` loops `isSubjectEnabled` per subject (`:144-148`) →
N full scans per save; search filters that re-query per keystroke repeat it.
Cost grows with the exam/teaching stores.

## LOW

- **F7 — `addAssignmentSubject` still pins the built-in teacher.**
  `js/teacher-assignments.js:161-164` looks rows up under
  `readStaffAccount('teacher')` and re-saves without `teacherUsername`. For a
  directory teacher it would silently create/replace `teacher.apc` rows.
  Currently uncalled, but exported.
- **F8 — class-switch tick leak.** `js/manager.js:235-243`: `chosen` carries
  the boxes ticked for the *previous* class into the new class's list via
  `includeLegacy`, so wrong-class ticks survive a class change; submit then
  errors (F3) or assigns a subject the class was never meant to run. The
  legacy hook was designed for values already on a record, not for switching.
- **F9 — Admin Setup: busy guard silently drops rapid actions.**
  `js/admin-academics.js:74-75`: a second click/tick during an in-flight save
  is discarded with no message and no re-render — the checkbox keeps the
  user's visual state while storage keeps the old one.
- **F10 — Admin Setup: `render()` wipes in-progress input; dead reset.**
  The whole mount (both forms) is rebuilt on every action and storage event,
  so unsubmitted text in the other form is lost; `run(...).then(() =>
  classForm.reset())` resets a detached node (innerHTML already replaced).
- **F11 — consistency notes.** `js/academics.js:353-358` `listMappings`
  comment says "newest configuration wins" but the filter keeps the first
  row; `js/academics.js:391-398` `classCodeFor`/`subjectCodeFor` fall back to
  `allocate*(name, [])`, ignoring other codes when a record arrives with an
  empty code; `js/academics.js:119-121` hardcodes
  `'activePlus.manager.teacherAssignments.v1'` instead of
  `TEACHER_ASSIGNMENTS_KEY`; `js/academics.js:271-278` `migrate`'s
  `SUBJECT_LIBRARY` if/else branches are identical (dead distinction).

## Repro scripts

Findings F1–F3 were proven in jsdom against the production modules
(`/tmp/dbg4.mjs`, `/tmp/dbg5.mjs` in the session; steps quoted inline above).
