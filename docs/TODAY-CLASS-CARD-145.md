# Today classes — compact Today-study pattern and direct class publishing (145)

## Request interpreted from the existing screen

The student home’s “আজ কোনো ক্লাস যোগ করা নেই” card should look like “আজকের পড়াশোনা”, rather than a large stretched empty box. Verify that adding a class actually works. Do not invent a class, make a student a manager, hide data errors or remove the previous home/More/PDF work.

## Changes

- The empty class entry shares the actual `challenge-card`, `challenge-icon`, `challenge-copy` and `challenge-open` pattern used by Today study: rounded paper, small illustrated icon on the left, title/subtitle and a round routine action on the right.
- Short, honest wording: **আজ কোনো ক্লাস নেই** / **সময়সূচি দেখতে রুটিন খুলুন।**
- The card is content-height, not stretched through the remaining overview. It retains the measured full-screen overview/footer clearance, all eight service entrances and reachable Today-study/exam/fee content. The common round action is at least 44px.
- Real office/teacher class selection, student/class filtering, state updates and load-error handling are unchanged. No fake class/progress is displayed and no data is written by rendering.
- A real native add-class test exposed a separate Manager UI defect: `#managerRoutineClass` received its choices only while rendering Classes. Direct Home/More → Routine therefore left the required select empty, preventing native form submission.
- `renderRoutineClassOptions()` now runs from both Classes and Routine. It uses the same existing `enabledClasses`, preserves a selected class on day switches and leaves the session guard, validation, save schema and publishing handler unchanged.
- Service-worker and six entry asset versions move together to **145**. No storage migration/clearing or backend changes.

## Verified

- New compact-card regressions: old implementation **2/4 passed, 2 failed**; fixed implementation **4/4 passed**.
- New direct-Manager regressions: old implementation **0/3 passed**; fixed implementation **3/3 passed**, including native required-select validity and an actually saved class name.
- Full Node suite: **659/659 passed**.
- Native acceptance across seven specs: **88/88 passed**, including:
  - compact class/study geometry in light/AMOLED at 320px, 390px and desktop;
  - the actual Manager form publishing a class, followed by a real student login seeing it instead of the empty card;
  - cold offline reload after clearing HTTP cache, then opening the routine;
  - all previous home-fit, five-panel layout, icons, More/report, receipt/address-once and offline payment-PDF cases.
- After the final shared text-colour refinement and removal of an unrelated button-size change, affected Node tests **34/34** and native Today/home-fit tests **20/20** passed again. Native checks compare actual colour/material/spacing, icon widths, row order, compact height, text bounds and 44px actions, not just CSS class names.
- `git diff --check` is clean.

## Review

[Eight real-app screenshots](../preview/today-class-145/index.html), captured with synthetic accounts only. `tools/capture-today-class.cjs` reproduces them against a local app server, with optional browser/origin environment variables.

No commit, push, production deployment or Firebase backend repair was performed. Visible sync warnings remain truthful; the scheduled sample class exists only in an isolated browser test context.
