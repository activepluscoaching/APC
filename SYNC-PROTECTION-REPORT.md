# Active Plus — Sync Protection Report

## 1. Root cause found

The PWA Service Worker cache version was not consistently advancing with sync changes. The repository was still serving an older sync shell (v99) after later sync/UI commits. This allowed stale JavaScript to run with newer UI code.

A second architectural weakness was that the live sync implementation and Firebase configuration lived under js/, so ordinary UI maintenance could accidentally touch the same implementation boundary.

## 2. Files changed in this hardening round

- firebase/firebase-config.js — single Firebase configuration source
- firebase/firebase-init.js — idempotent initialization + App Check hook
- firebase/firebase-services.js — centralized Firebase SDK service imports
- sync/sync-core.js — protected SyncService facade with lazy implementation loading
- sync/sync-config.js — sync root/retry policy
- sync/sync-auth.js — authentication facade
- sync/sync-queue.js — durable queue contract
- sync/sync-retry.js — exponential retry policy
- sync/sync-status.js — status facade
- sync/sync-guard.js — read-only startup integrity guard
- sync/SYNC-PROTECTION.md / sync/README.md — maintenance boundary
- tests/sync-protection.test.mjs — regression checks
- existing sync entry/diagnostic modules were redirected to the protected boundary
- sw.js — protected assets added and cache advanced to v104

No LocalStorage/IndexedDB reset or destructive data migration was added.

## 3. Protected files

The logical protected zone is:
- sync/*
- firebase/*

Ordinary UI/theme/report/icon work must not modify this zone.

Legacy js/realtime-sync.js and js/firebase-config.js remain as compatibility implementation files; UI access now goes through the protected facade.

## 4. Firebase connection architecture

Firebase configuration is centralized in firebase/firebase-config.js.

Initialization is centralized and idempotent in firebase/firebase-init.js using the existing Firebase project.

Firebase SDK service imports are centralized in firebase/firebase-services.js.

## 5. Offline queue

Existing durable per-record outboxes remain the data-sync queue. Local writes are captured first; pending operations survive reloads and are flushed when the connection returns.

## 6. Retry

The protected retry policy defines:
- 2 seconds
- 5 seconds
- 10 seconds
- 30 seconds
- 60 seconds

The background sync bridge continues retrying after transient failures.

## 7. Data-loss protection

No destructive storage operation was introduced.

The protected sync layer contains no localStorage.clear() or indexedDB.deleteDatabase().

Existing merge/outbox logic remains responsible for preserving local pending changes.

## 8. Theme-change protection

The SyncService boundary is independent of the theme layer. Theme/CSS changes do not need to import Firebase.

Static regression coverage verifies that the protected sync architecture exists and that the UI entry points use the protected Sync facade.

## 9. Refresh protection

The durable outbox and LocalStorage-first design remain in place. A page refresh does not intentionally clear sync state or application data.

## 10. Offline → Online recovery

The existing realtime bridge uses browser online/offline events plus Firebase /.info/connected; pending work is retried after recovery.

## 11. Final Sync Health Status

ARCHITECTURE HARDENED — LIVE FIREBASE VERIFICATION REQUIRED

Repository-level protection and regression checks are in place. A real two-device Firebase test cannot honestly be marked PASS from static repository inspection alone; it requires running the deployed PWA against the live Firebase project.

Required live checks:
- Anonymous Authentication enabled
- Realtime Database reachable
- Rules permit the authenticated sync paths
- Fresh device → cloud
- second device → cloud pull
- offline write → reconnect
- theme change → sync
- refresh → sync
- logout/login → sync
