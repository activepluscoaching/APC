> **2026-09-29 security update:** The legacy anonymous RTDB bridge is now disabled.
> Rules deny all client reads/writes; cloud login, sync and push registration are
> paused. Earlier anonymous/test-bridge instructions below are historical, not
> deployment instructions. See `docs/CLOUD-CONTAINMENT-114.md` for impact and rollout.

# Active Plus — Protected Online Sync Core

## Protected Zone

The following paths are protected from ordinary UI/theme work:

- sync/*
- firebase/*

## DO NOT MODIFY for UI/theme/report/icon/layout changes

Protected core files include:

sync/sync-core.js
sync/sync-config.js
sync/sync-auth.js
sync/sync-queue.js
sync/sync-retry.js
sync/sync-status.js
sync/sync-guard.js

firebase/firebase-init.js
firebase/firebase-config.js
firebase/firebase-services.js

The legacy js/realtime-sync.js and js/firebase-config.js are compatibility implementation files. UI code must use the protected sync facade instead of importing them directly.

## Rules

1. Never clear LocalStorage or IndexedDB during an update.
2. Never disable sync because a UI/theme component changed.
3. Never put Firebase SDK/configuration in CSS/theme/UI modules.
4. Offline writes remain local and pending work remains in the durable outbox.
5. Firebase connectivity is measured separately from browser Internet state.
6. A failed read/write reports an error and retries; it does not delete local data.
7. Firebase initialization is centralized and idempotent.
8. Any intentional sync change requires a sync-specific audit and regression tests.

## Health Contract

The Sync Guard must verify configuration, initialization, SyncService, local storage and queue availability before deployment.

## Change Boundary

UI change -> UI/CSS/components only.
Theme change -> theme files only.
Sync change -> protected sync/firebase zone only, explicitly requested.
