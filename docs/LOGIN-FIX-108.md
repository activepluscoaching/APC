# Existing-ID login and blank-entry fix — release 108

## Reproduced defects
- Stored non-default Manager/Teacher/Payment usernames resolved to the right role but authenticateStaff compared them against the fixed default username. Before the fix 3/4 existing-role browser cases failed; Admin already used its stored username.
- Plaintext staff password upgrade rebuilt the record with the default username and omitted profile fields. It now preserves the existing identity/profile and replaces only the legacy credential fields while retaining mandatory password change.
- Form could be submitted before application initialization (or with a missing module), producing an inert attempt or native navigation. A hidden staff shell had no module-load failure fallback.

## Changes
- Use the stored role username consistently for resolution and password verification. Never enable a hardcoded alias independent of a stored account.
- Read legacy cash-counter `userId/pin` fields; verify the original password before the existing hash/forced-change flow. Preserve Staff ID, original ID, name and timestamps. Unreadable encrypted accounts fail closed, never enter first-use setup.
- Login submit disabled until its handler is installed; synchronous preventDefault, duplicate-submit guard, busy state, caught asynchronous errors, and check session persistence success.
- `js/app-entry.js`: a head-installed native-submit guard and bounded entry-module loader. Missing modules show a retry/login screen without deleting storage or redirecting to a different role. Dynamic entry loading uses unqueried module URLs consistent with the worker's precached modules.
- Login CSP `form-action 'none'` prevents native credential form navigation even if the entry loader itself fails. Existing JS-driven submissions remain.
- Cache 108; all protected assets remain. `/firebase/*` and `/sync/*` unchanged. No account/data reset, username regeneration, database deletion or new schema.

## Evidence
- Final combined Playwright run: **45/45 passed** (legacy-login, auth-redesign, minimal-ui, minimal-workflows).
- Selected unit run: **105/105 passed** (staff-auth, first-admin-setup, staff-directory-login, login-payment-entry, payment-auth, session, minimal-ui, sync-protection, student-page, payment-autologin, panel-lockdown, account-policy, report-layout, finance).
- Includes old AP-1024 / sYYMMDD…suffix / S-YYMMDD… student IDs; custom role IDs; actual old cash `userId/pin`; password change preserves profile; missing-module failure without credential URL; offline worker reload; reports/payment/MCQ regressions.
- Fault-injection suite blocks service workers only in its isolated test browser context so intercepted module failures cannot be rescued by precache. Separate workflow suite keeps real service workers enabled and tests offline reload. No app sync/PWA disabling was added.
- Syntax checks and git diff --check pass.

These are isolated local-browser tests, not direct access to the user's production account or phone. Existing production Firebase/network availability remains outside this verification. Users must not clear site data or recreate accounts to install this release.
