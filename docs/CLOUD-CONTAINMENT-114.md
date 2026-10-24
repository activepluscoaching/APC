> **Superseded 2026-09-30.** By owner decision the anonymous bridge is running
> again as an interim measure with hardened `auth != null` rules — see
> `docs/INTERIM-ANONYMOUS-SYNC.md`. This document is kept as history and as the
> reference for re-applying containment (its deny-all rules are the emergency
> pause).

# Cloud containment — 2026-09-29 (cache 114)

## Current state

This is an emergency **local-only** mode, not a completed production cloud-auth
migration. `database.rules.json` denies all RTDB client reads and writes.
`sync/cloud-access.js` disables the legacy anonymous bridge in the shipped app.
Existing local accounts still require their correct credentials. Local data is
not deleted; cloud data is not deleted either. New-device credential retrieval,
cross-device synchronization and push-token registration are unavailable.

Previous setup instructions recommending `auth != null` or enabling the
anonymous test bridge are superseded. Do not restore those rules to make login
work. An anonymous Firebase identity does not prove an app ID/password login.
The old bridge also exposed credential-bearing nodes to anonymous clients.

## Why both changes are necessary

- Rules are the security boundary: cached/old clients cannot bypass published
  deny-all rules. Client-only login/session checks were not authorization.
- The app gate stops requests rather than endlessly retrying rejected reads.
  Normal entry points stop before importing the Firebase implementation.
- Explicit diagnostic reads and push registration are also gated.
- The disabled flag is compiled source, not a localStorage/query-string toggle.
- A rules deny does not stop privileged Admin SDK/server operations. Investigate
  any remaining traffic from Functions, admin scripts, emulators or other apps.

## Publish and verify (not performed in this workspace)

1. Confirm the console counter is for the intended **Realtime Database instance**
   and date/time range, not Firestore. A cumulative “3.7K Allow” is not 3.7K app
   logins and will not reset merely because new rules are published. Its origin
   cannot be determined from the number alone.
2. In that instance's Rules tab publish the exact `database.rules.json` content:
   ```json
   { "rules": { ".read": false, ".write": false } }
   ```
   Or, using an already authenticated Firebase CLI with the intended project and
   instance confirmed: `firebase deploy --only database --project active-plus`.
   This stops ALL RTDB client access, including existing signed-in clients.
3. Deploy the updated static app and service worker (cache 114) together. Update
   or close/reopen old installed clients. Rules stop old clients' successful
   requests, but only updated client code stops their retry attempts.
4. In Rules Playground test reads and writes at the root, `activePlusSync/v1`,
   `students`, `transactions`, `staffAccounts`, `studentAccounts`, `pushTokens`
   and an unknown path, both unauthenticated and with an anonymous UID. All must
   be denied. Do not test a live write against real student records.
5. In browser Network, leave login idle, retry, run diagnostics, then log in to
   a saved local account: this build should issue no RTDB operations. Check a
   fresh metrics time range separately. Verify local data remains available.

No Firebase CLI/credentials were used here to publish rules. No live database
reads/writes were made for validation. Rule verification in this workspace is a
structural exact-deny-policy assertion, not an emulator/production evaluation.

## Required before cloud can return

Implement server-side credential verification/Firebase Auth, bind each app user
to its authenticated UID, migrate authorization/data paths, keep password hashes
and credential directories inaccessible to clients, and test per-user/role rules
with the emulator. Existing Cloud Functions/Firestore claims do not automatically
authorize the current local-login RTDB bridge. Merely adding `auth != null`, a
local session flag or an unrestricted custom claim is not an acceptable fix.

## Regression coverage

`tests/cloud-containment.test.mjs` uses the real shipped policy and app modules,
with Firebase boundary calls instrumented. It asserts zero auth/read/write/
transaction/listener calls for login, retry, diagnostics, push registration and
local login, plus direct implementation-call blocking and exact deny-all rules.
The older reconnect/lifecycle tests explicitly opt into the legacy engine ONLY
in their test loader to retain regression coverage; they do not represent an
enabled production bridge or live cloud-login validation.

## Proposed replacement

A per-user/per-role design (draft rules, simulator tests, emulator suite and the
list of required code changes) is in `docs/RTDB-PER-USER-RULES-PLAN.md`. It is
not deployed; `database.rules.json` above remains the published policy.
