# Active Plus Sync Layer

This directory is the protected service boundary for online synchronization.

Public UI contract:
- SyncService.start()
- SyncService.syncNow()
- SyncService.getStatus()

Implementation details stay behind the facade. Local data remains the first write target; the durable outbox handles pending cloud operations and the realtime bridge handles Firebase transport/recovery.

Do not import Firebase SDKs from UI/theme files.
