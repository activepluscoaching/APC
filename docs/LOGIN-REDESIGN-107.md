# Header-free login and launch screen — release 107

- Removed login topbar and automatic Firebase Diagnostic script. The diagnostic button was a developer-facing connection tester, not an authentication requirement. Diagnostic modules remain available to existing tooling; Firebase/core is unchanged.
- Centered Active Plus logo, app name and Bengali tagline above tabs/form. The supplied images are layout references only; their unrelated branding is not used.
- Auth styles moved into `css/ui-auth.css`, not layered over previous auth rules. Status/retry notices remain truthful but are placed below the auth card; never inside a header or over form buttons.
- Existing register and recovery listeners reproduced successfully before editing; no claim of a credential-engine bug fix. New tests cover tab transitions and recovery. Security-question reset for an existing student followed by login with the new password passes. Staff recovery is not newly implemented.
- Logo/tagline-only launch UI added to all six application entry pages. Independent of Firebase/auth, 400ms minimum on normal load, 2.8-second safety dismissal, keyboard dismissal and CSS fallback. No added data writes.
- Service worker cache 107 includes new assets and remains duplicate-free.

Validation: 5/5 auth-specific browser tests passed on final standalone run; 9/9 UI/cache/protection unit tests passed. Combined 35-test browser run had 34 passes and one intermittent empty-account recovery-message assertion failure at 768px; it passed on standalone rerun. Existing-account reset/sign-in and all 30 role/workflow checks passed in the combined run. This intermittent result is not concealed as a full green run.

Mobile login screenshot inspected at 390px. Actual Android hardware and live Firebase are not certified.
