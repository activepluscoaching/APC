# Student home — no-classes screen fit (141)

Request: make the student home’s “আজ কোনো ক্লাস নেই” area fit the full screen.

## Result

The **primary empty home overview** (identity/progress, all eight service shortcuts and Today’s Classes) fills the available first screen on ordinary portrait phones. The no-classes card spans the content width and grows into the remaining space, rather than being clipped behind the footer or its raised centre action.

- [Review six real-app captures](../preview/student-home-141/index.html), light and AMOLED at 320×740, 390×844 and 412×915.
- Homework, fees and published exam cards are not removed or hidden to force a fit. They remain below the overview and are reachable by scrolling.
- Very short/landscape screens retain an accessible middle scroller instead of scaling the whole page or shrinking control targets.
- Visible status/sync notices are kept truthful and take real space. No Firebase warning is concealed or repaired by this presentation update.

## Implementation

- `index.html`: groups the existing hero/services/Today section in `.student-home-overview`; all routes, labels, controls and data IDs remain.
- `js/student-dashboard.js`: exposes `empty`/`ready`/`error` presentation state and switches `.is-empty-routine` only from the existing real office/teacher record selection. No new or demo classes are generated. The existing routine action receives a 44px labelled button and matching SVG.
- `js/fixed-shell.js`: reuses the bar measurements and also measures the actual main viewport. A `ResizeObserver` follows the main/status/font/header changes, with unchanged values not written again. This accommodates notices within or above the shell instead of guessing the available height.
- `css/ui-wallet.css`: scoped student viewport/footer clearance, adaptive empty-only progress/service spacing, full-width remaining-space card, and normal short-screen scrolling. Desktop retains the eight-column service grid; a populated Today list retains the original two-column desktop arrangement via the presentation wrapper.
- `css/foundation.css`: default measured-layout tokens only; brand palette and all new icons are retained.
- HTML and service-worker release **141**, with the completed offline skin. No account/storage schema migration, finance calculation, auth, role or assignment-policy changes.

## Validation

- Full Node suite: **628/628 passed**. After the final desktop-selector adjustment, the affected CSS/icon static tests also passed **16/16**.
- Final targeted Chromium run: **93/93 passed** — the prior 81 redesign/icon/record/admin/payment/offline acceptance cases plus 12 new student-home cases.
- New cases verify complete no-classes card bounds above the raised action, exact footer/main alignment, no document overflow, all eight >=44px controls, usable routine navigation/back, retained daily-study content, both themes at four portrait sizes, short/landscape scrolling, a genuine routine-data update toggling the layout, and viewport/header remeasurement.
- Desktop testing initially caught a real four-column regression caused by the new wrapper; the selectors were corrected (not the expected eight-column requirement). Final full targeted rerun is green.
- `tools/capture-student-home.cjs` reproduces the six screenshots with synthetic data in disposable browser contexts. Run against the local app on :8000; optional `APC_PREVIEW_URL` and `CHROMIUM_EXECUTABLE`.

The captures and catalogue are local review artifacts. No production deployment, Git push or cloud repair is claimed.
