# Date-wise examination archive (2026-10-02, cache 148)

**Status: ACTIVE.** The teacher/manager examination screen is now a date-wise
archive with a review workflow and question-level editing. The old flat list
(one "list" of papers, questions always open) is gone; the storage key
(`activePlus.exams.v1`) and the record shape are unchanged apart from additive
fields, so existing exam/attempt data keeps loading exactly as before.

## What changed

| Piece | State |
| --- | --- |
| `js/exam-data.js` | Status set extended (see below); every record is stamped with `examDate`, `durationMinutes`, `createdBy`, `createdByRole`, workflow timestamps; every question gets a permanent `uid` (`<examId>-qN`) plus its exam context; question-level `addQuestion`/`updateQuestion`/`deleteQuestion`; `reschedule`, `duplicate`, `complete`, `archive`, `restore`, `unpublish` |
| `js/exam-archive.js` | Pure helpers: `EXAM_FILTERS`/`normalizeFilters`, `filterExams`, `groupExamsByDate`, `upcomingExams`, `examCounters`, `workflowSteps`, `examPermissions`, date/duration formatting |
| `js/exam-manager.js` | Landing hub (Create Exam · Upcoming · Exam History · Question Archive), the six-field filter bar, the date-grouped table, collapsed questions behind **View Questions**, the review form and the authoring editor |
| `css/exam-archive.css` | Mobile-first styling; below 720 px the dashboard table becomes one card per exam. Loaded by `css/design-system.css`; precached by `sw.js` |

## Status workflow

```
draft → pending → approved → published → completed → archived
                 ↘ rejected  (correction branch)
```

- **Teacher**: creates/submits their own papers; may edit questions while the
  paper is a draft, pending or rejected. Never approves, publishes, unpublishes,
  completes, archives or deletes a published paper.
- **Manager**: every paper in every status — create, edit/add/delete questions,
  change options and the answer key, set date/class/marks/duration, save draft,
  review, approve, publish, unpublish, complete, archive, restore, duplicate
  (old questions → new draft) and delete. Delete is offered only for
  draft/rejected/archived papers with no stored answers, and always asks first.
- **Student**: only `published` and `completed` papers of their own class ever
  reach the student UI; `draft`, `pending`, `approved`, `rejected` and
  `archived` are staff-only.

## Date-wise records

Each paper is filed under its own exam date (`Asia/Dhaka` for MCQ start,
next class day for written/short). Two exams on the same date stay separate
records with separate Examination IDs and separate questions — nothing is
merged, and nothing from another date is shown in the same group. Changing the
exam date/time re-files the record under the new date on the next render.
History, Upcoming and the Question Archive all group by date, newest first
(soonest first for Upcoming), with counters per status.

The dashboard row shows Date · Exam · Class · Subject · Questions · Full marks
· Duration · Status · Action. Filters: name/ID/question text, single date,
date range, class, subject, status and type. Question lists are **never** open
by default: the archive shows only the exam list, and **View Questions** opens
one paper's questions.

## Data safety

- Reads are additive: an old record without `examDate`/`uid`/`durationMinutes`
  gains those values in memory, and a stable question id is derived
  (`<examId>-q1`, …) instead of inventing a new one; the first write persists
  them without touching any other field.
- The paste template is re-generated from the stored question records
  (`serializeQuestions`), so question edits cannot desynchronise the two.
- A paper with any stored attempt can be unpublished and archived, but never
  deleted; republishing keeps its answers, roster and a released result.
- All destructive actions go through `window.confirm`, and archived records
  keep their questions, participants and results for restore.

## Tests

`tests/exam-archive.test.mjs` (repository + pure helpers: grouping, filters,
workflow transitions, permissions, question identity, data safety) and
`tests/exam-archive-ui.test.mjs` (teacher.html: hub, date-wise records,
View Questions isolation, question edit/add/delete with confirmation, filters,
published-paper freeze, Question Archive). Cache bump to `148` ships the new
module and stylesheet to already-installed clients.
