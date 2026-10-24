# Active Plus — Dual-Cloud Database Setup (Firebase + Supabase)

Active Plus Coaching runs a **Dual-Cloud Offline-First Sync Architecture** where **both Firebase Realtime Database and Supabase PostgreSQL + Realtime** stay active simultaneously:

1. **Local Storage First**: Every read/write hits device storage (`localStorage` + `IndexedDB`) first for instant offline operation.
2. **Firebase Realtime Database (`js/realtime-sync.js`)**: Primary realtime sync engine (`activePlusSync/v1`) with durable per-record outboxes (`activePlus.syncOutbox.v2:<collection>`).
3. **Supabase PostgreSQL + Realtime (`js/supabase-sync.js`)**: Active relational & realtime mirror (`apc_records`, `apc_exam_db`, `apc_staff_accounts`, `apc_staff_directory`, `apc_student_accounts`, `apc_usernames`, `apc_identity_index`, `apc_daily_counters`, `apc_notifications`, `apc_system`) with its own durable per-record outbox (`activePlus.supabaseOutbox.v1:<collection>`) and automatic failover if either cloud is temporarily unreachable.

---

## Connected Supabase Project

- **Project Name**: `active-plus-coaching`
- **Project Reference**: `orrinivkfioolkekerkh`
- **Region**: `ap-southeast-1` (Singapore)
- **Project URL**: `https://orrinivkfioolkekerkh.supabase.co`
- **Client Config**: `sync/supabase-config.js` (uses only the browser-safe `sb_publishable_*` key — never store `service_role` or `sb_secret_*` keys in client code).

---

## Database Schema & Migrations

The complete PostgreSQL schema, Row Level Security (RLS) policies, PBKDF2/no-plaintext `CHECK` constraints, `supabase_realtime` publication, and atomic `SECURITY DEFINER` RPCs are version-controlled in:

- `supabase/migrations/20261024000001_active_plus_dual_sync.sql`

### Atomic PostgreSQL RPCs
- `apc_merge_collection_ops(p_collection, p_ops)` — Per-record timestamp-aware merge for all synced collections (`students`, `transactions`, `notices`, `routine`, `teaching`, `settings`, `academics`, `courseContent`, `courses`, `questionBank`, `teacherAssignments`, and AES-256-GCM E2EE `classChat`).
- `apc_claim_first_admin(p_record)` — Single-winner atomic claim for the institution's first Admin account.
- `apc_merge_staff_directory(p_ops)` — Timestamp-aware merge for PBKDF2-hashed staff directory records.
- `apc_upsert_student_account(p_login_key, p_record)` — Immutable-identity student credential upsert (blocks plaintext PINs and cross-student hijacking).
- `apc_register_student_atomic(...)` — Atomic student registration with global uniqueness checks (`username`, `mobile`, `email`) and 9-digit `YYMMDDSSS` ID allocation mirrored with Firebase.
- `apc_reset_cloud_database()` — Coordinated cloud reset invoked alongside Firebase during Admin factory reset.

---

## Rebuilding Vendor SDK Bundles

Both Firebase and Supabase SDKs are bundled as same-origin ES modules so the Service Worker (`sw.js`) can precache them for offline launch without external CDN dependencies:

```bash
npm run build:firebase
npm run build:supabase
```

---

## Hosting Compatibility

- **GitHub Pages**: Ready out of the box (`.nojekyll`, relative asset paths, CSP `<meta>` headers on all portals).
- **Netlify**: Configured via `netlify.toml` (automated SDK bundle build, CSP & cache-control headers, non-public directory blocking).
- **Firebase Hosting**: Configured via `firebase.json`.
