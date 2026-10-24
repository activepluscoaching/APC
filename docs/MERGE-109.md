# PR #34 merge reconciliation — release 109

Merged upstream main through `13ab90a` into the working branch before merging the PR.

- Retained upstream local-first login, immutable credential snapshot and login-attempt protection.
- Retained this branch's readiness guard, legacy-ID compatibility, error UI, duplicate-submit guard and session-write failure check. The session check applies to both upstream student success paths.
- Kept upstream `sync/sync-core.js` single-flight hydration and `js/sync-merge.js` password-tie protection unchanged. Protected-core audit now compares with upstream `13ab90a`, not the earlier pre-fix commit.
- Resolved the cache-version conflict as **109**, retaining all protected/new UI assets; HTML asset version references and release assertions updated.
- Post-resolution validation: **116/116 selected unit tests**, **45/45 browser tests**, changed JS syntax checks and `git diff --check` pass. Full historical suite and real production Firebase remain subject to the limitations already documented.
