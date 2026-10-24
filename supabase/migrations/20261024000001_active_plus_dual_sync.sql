-- Active Plus Coaching — Dual-Cloud Supabase Schema, RLS, Atomic RPCs & Realtime
-- Works alongside Firebase RTDB without altering local data formats or credentials.

CREATE OR REPLACE FUNCTION public.apc_is_pbkdf2_hash(val jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT val IS NOT NULL
    AND jsonb_typeof(val) = 'object'
    AND coalesce(val->>'algorithm', '') LIKE 'PBKDF2%'
    AND length(coalesce(val->>'hash', '')) >= 16
    AND length(coalesce(val->>'salt', '')) >= 8;
$$;

CREATE OR REPLACE FUNCTION public.apc_parse_epoch_ms(raw_val jsonb)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  txt text;
  ts timestamptz;
BEGIN
  IF raw_val IS NULL OR jsonb_typeof(raw_val) = 'null' THEN
    RETURN 0;
  END IF;
  IF jsonb_typeof(raw_val) = 'number' THEN
    RETURN floor((raw_val::text)::numeric)::bigint;
  END IF;
  IF jsonb_typeof(raw_val) = 'string' THEN
    txt := raw_val #>> '{}';
    IF txt ~ '^\d+$' THEN
      RETURN (txt::numeric)::bigint;
    END IF;
    ts := txt::timestamptz;
    RETURN floor(extract(epoch FROM ts) * 1000)::bigint;
  END IF;
  RETURN 0;
EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.apc_record_time_ms(val jsonb)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  ms bigint;
BEGIN
  IF val IS NULL OR jsonb_typeof(val) <> 'object' THEN
    RETURN 0;
  END IF;
  ms := public.apc_parse_epoch_ms(val->'updatedAt');
  IF ms > 0 THEN RETURN ms; END IF;
  ms := public.apc_parse_epoch_ms(val #> '{record,updatedAt}');
  IF ms > 0 THEN RETURN ms; END IF;
  ms := public.apc_parse_epoch_ms(val->'reviewedAt');
  IF ms > 0 THEN RETURN ms; END IF;
  ms := public.apc_parse_epoch_ms(val->'publishedAt');
  IF ms > 0 THEN RETURN ms; END IF;
  ms := public.apc_parse_epoch_ms(val->'registeredAt');
  IF ms > 0 THEN RETURN ms; END IF;
  ms := public.apc_parse_epoch_ms(val #> '{record,registeredAt}');
  IF ms > 0 THEN RETURN ms; END IF;
  ms := public.apc_parse_epoch_ms(val->'createdAt');
  IF ms > 0 THEN RETURN ms; END IF;
  ms := public.apc_parse_epoch_ms(val #> '{record,createdAt}');
  IF ms > 0 THEN RETURN ms; END IF;
  ms := public.apc_parse_epoch_ms(val->'recordedAt');
  IF ms > 0 THEN RETURN ms; END IF;
  RETURN 0;
END;
$$;

-- 1. Unified Collection Records
CREATE TABLE IF NOT EXISTS public.apc_records (
  collection text NOT NULL CHECK (collection IN (
    'students', 'transactions', 'notices', 'routine', 'teaching',
    'settings', 'academics', 'courseContent', 'courses',
    'classChat', 'questionBank', 'teacherAssignments'
  )),
  record_id text NOT NULL CHECK (length(record_id) BETWEEN 1 AND 256),
  payload jsonb NOT NULL,
  updated_at_ms bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, record_id),
  CONSTRAINT apc_records_no_plaintext_student_pin CHECK (
    collection <> 'students' OR (
      jsonb_typeof(payload) <> 'object' OR (
        NOT (payload ? 'pin')
        AND NOT (payload ? 'password')
        AND NOT (payload ? 'securityAnswer')
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_apc_records_collection_updated
  ON public.apc_records (collection, updated_at DESC);

-- 2. Dedicated Exam DB (exams + attempts)
CREATE TABLE IF NOT EXISTS public.apc_exam_db (
  space text NOT NULL CHECK (space IN ('exams', 'attempts')),
  item_id text NOT NULL CHECK (length(item_id) BETWEEN 1 AND 256),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space, item_id)
);

-- 3. Staff Role Accounts (PBKDF2 hashes only)
CREATE TABLE IF NOT EXISTS public.apc_staff_accounts (
  role text PRIMARY KEY CHECK (role IN ('admin', 'manager', 'teacher', 'payment')),
  username text NOT NULL CHECK (length(username) BETWEEN 1 AND 120),
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object'
    AND public.apc_is_pbkdf2_hash(payload->'password')
  ),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Staff Directory
CREATE TABLE IF NOT EXISTS public.apc_staff_directory (
  staff_id text PRIMARY KEY CHECK (length(staff_id) BETWEEN 1 AND 256),
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object'
    AND NOT (payload ? 'plainPassword')
  ),
  updated_at_ms bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Student Login Accounts (PBKDF2 pinHash only, indexed for fast lookup)
CREATE TABLE IF NOT EXISTS public.apc_student_accounts (
  login_key text PRIMARY KEY CHECK (length(login_key) BETWEEN 1 AND 256),
  student_id text,
  username text,
  mobile text,
  email text,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object'
    AND public.apc_is_pbkdf2_hash(payload->'pinHash')
    AND NOT (payload ? 'pin')
    AND NOT (payload ? 'securityAnswer')
  ),
  updated_at_ms bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apc_student_accounts_student_id
  ON public.apc_student_accounts (student_id);
CREATE INDEX IF NOT EXISTS idx_apc_student_accounts_mobile
  ON public.apc_student_accounts (mobile);
CREATE INDEX IF NOT EXISTS idx_apc_student_accounts_email
  ON public.apc_student_accounts (email);

-- 6. Claimed Usernames Registry
CREATE TABLE IF NOT EXISTS public.apc_usernames (
  username text PRIMARY KEY CHECK (length(username) BETWEEN 1 AND 120),
  claim jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Mobile & Email Uniqueness Claims
CREATE TABLE IF NOT EXISTS public.apc_identity_index (
  kind text NOT NULL CHECK (kind IN ('mobile', 'email')),
  identifier text NOT NULL CHECK (length(identifier) BETWEEN 1 AND 256),
  student_id text NOT NULL,
  claim jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, identifier)
);

-- 8. Daily 9-digit Student ID Counter (Asia/Dhaka YYMMDD)
CREATE TABLE IF NOT EXISTS public.apc_daily_counters (
  yymmdd text PRIMARY KEY CHECK (yymmdd ~ '^\d{6}$'),
  last_serial integer NOT NULL DEFAULT 0 CHECK (last_serial BETWEEN 0 AND 999),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Registration & System Notifications
CREATE TABLE IF NOT EXISTS public.apc_notifications (
  notification_id text PRIMARY KEY CHECK (length(notification_id) BETWEEN 1 AND 256),
  student_id text,
  is_read boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at_iso text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apc_notifications_student_id
  ON public.apc_notifications (student_id);

-- 10. System Flags (adminInitialized, etc.)
CREATE TABLE IF NOT EXISTS public.apc_system (
  key text PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 120),
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Atomic RPC 1: Merge per-record outbox operations for a collection
CREATE OR REPLACE FUNCTION public.apc_merge_collection_ops(
  p_collection text,
  p_ops jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  v_op jsonb;
  v_seed boolean;
  v_val jsonb;
  v_cand_ms bigint;
  v_cur_ms bigint;
  v_exists boolean;
  v_result jsonb;
BEGIN
  IF p_ops IS NOT NULL AND jsonb_typeof(p_ops) = 'object' THEN
    FOR rec IN SELECT key, value FROM jsonb_each(p_ops) LOOP
      v_op := rec.value;
      IF v_op IS NULL OR jsonb_typeof(v_op) <> 'object' THEN
        CONTINUE;
      END IF;
      v_seed := coalesce((v_op->>'seed')::boolean, false);
      v_val := v_op->'value';

      SELECT true, updated_at_ms INTO v_exists, v_cur_ms
        FROM public.apc_records
        WHERE collection = p_collection AND record_id = rec.key
        FOR UPDATE;

      IF coalesce(v_exists, false) AND v_seed THEN
        CONTINUE;
      END IF;

      IF v_val IS NULL OR jsonb_typeof(v_val) = 'null' THEN
        DELETE FROM public.apc_records
          WHERE collection = p_collection AND record_id = rec.key;
      ELSE
        v_cand_ms := public.apc_record_time_ms(v_val);
        IF coalesce(v_exists, false) AND v_cand_ms > 0 AND coalesce(v_cur_ms, 0) > v_cand_ms THEN
          CONTINUE;
        END IF;
        INSERT INTO public.apc_records (collection, record_id, payload, updated_at_ms, updated_at)
        VALUES (p_collection, rec.key, v_val, v_cand_ms, now())
        ON CONFLICT (collection, record_id) DO UPDATE
          SET payload = EXCLUDED.payload,
              updated_at_ms = EXCLUDED.updated_at_ms,
              updated_at = now();
      END IF;
    END LOOP;
  END IF;

  SELECT coalesce(jsonb_object_agg(record_id, payload), '{}'::jsonb)
    INTO v_result
    FROM public.apc_records
    WHERE collection = p_collection;

  RETURN v_result;
END;
$$;

-- Atomic RPC 2: Claim the institution's one-time First Admin Account
CREATE OR REPLACE FUNCTION public.apc_claim_first_admin(p_record jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_inserted integer;
BEGIN
  IF p_record IS NULL OR jsonb_typeof(p_record) <> 'object' OR NOT public.apc_is_pbkdf2_hash(p_record->'password') THEN
    RAISE EXCEPTION 'Invalid admin credential record';
  END IF;
  v_username := coalesce(nullif(trim(p_record->>'username'), ''), 'admin.apc');

  INSERT INTO public.apc_staff_accounts (role, username, payload, updated_at)
  VALUES ('admin', v_username, p_record, now())
  ON CONFLICT (role) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('committed', false, 'reason', 'admin-exists');
  END IF;

  INSERT INTO public.apc_system (key, value, updated_at)
  VALUES ('adminInitialized', 'true'::jsonb, now())
  ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb, updated_at = now();

  RETURN jsonb_build_object('committed', true);
END;
$$;

-- Atomic RPC 3: Merge Staff Directory operations
CREATE OR REPLACE FUNCTION public.apc_merge_staff_directory(p_ops jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  v_op jsonb;
  v_seed boolean;
  v_val jsonb;
  v_cand_ms bigint;
  v_cur_ms bigint;
  v_exists boolean;
  v_records jsonb;
BEGIN
  IF p_ops IS NOT NULL AND jsonb_typeof(p_ops) = 'object' THEN
    FOR rec IN SELECT key, value FROM jsonb_each(p_ops) LOOP
      v_op := rec.value;
      IF v_op IS NULL OR jsonb_typeof(v_op) <> 'object' THEN
        CONTINUE;
      END IF;
      v_seed := coalesce((v_op->>'seed')::boolean, false);
      v_val := v_op->'value';

      SELECT true, updated_at_ms INTO v_exists, v_cur_ms
        FROM public.apc_staff_directory
        WHERE staff_id = rec.key
        FOR UPDATE;

      IF coalesce(v_exists, false) AND v_seed THEN
        CONTINUE;
      END IF;

      IF v_val IS NULL OR jsonb_typeof(v_val) = 'null' THEN
        DELETE FROM public.apc_staff_directory WHERE staff_id = rec.key;
      ELSE
        v_cand_ms := public.apc_record_time_ms(v_val);
        IF coalesce(v_exists, false) AND v_cand_ms > 0 AND coalesce(v_cur_ms, 0) > v_cand_ms THEN
          CONTINUE;
        END IF;
        INSERT INTO public.apc_staff_directory (staff_id, payload, updated_at_ms, updated_at)
        VALUES (rec.key, v_val, v_cand_ms, now())
        ON CONFLICT (staff_id) DO UPDATE
          SET payload = EXCLUDED.payload,
              updated_at_ms = EXCLUDED.updated_at_ms,
              updated_at = now();
      END IF;
    END LOOP;
  END IF;

  SELECT coalesce(jsonb_agg(payload ORDER BY staff_id), '[]'::jsonb)
    INTO v_records
    FROM public.apc_staff_directory;

  RETURN jsonb_build_object('version', 1, 'records', v_records);
END;
$$;

-- Atomic RPC 4: Safe Student Account Upsert (prevents login-key hijacking)
CREATE OR REPLACE FUNCTION public.apc_upsert_student_account(
  p_login_key text,
  p_record jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.apc_student_accounts%ROWTYPE;
  v_sid text;
  v_uname text;
  v_mobile text;
  v_email text;
  v_status text;
  v_ms bigint;
BEGIN
  IF p_login_key IS NULL OR length(trim(p_login_key)) = 0 THEN
    RAISE EXCEPTION 'Missing login_key';
  END IF;
  IF p_record IS NULL OR NOT public.apc_is_pbkdf2_hash(p_record->'pinHash') THEN
    RAISE EXCEPTION 'Invalid student account record';
  END IF;

  v_sid := nullif(trim(coalesce(p_record #>> '{student,id}', p_record->>'studentId', '')), '');
  v_uname := lower(nullif(trim(coalesce(p_record->>'username', p_record #>> '{student,username}', '')), ''));
  v_mobile := nullif(trim(coalesce(p_record->>'registrationMobile', p_record->>'mobile', '')), '');
  v_email := lower(nullif(trim(coalesce(p_record->>'email', p_record #>> '{student,email}', '')), ''));
  v_status := coalesce(nullif(trim(p_record->>'status'), ''), 'pending');
  v_ms := public.apc_record_time_ms(p_record);

  SELECT * INTO v_existing
    FROM public.apc_student_accounts
    WHERE login_key = p_login_key
    FOR UPDATE;

  IF FOUND THEN
    IF v_existing.student_id IS NOT NULL AND v_sid IS NOT NULL AND v_existing.student_id <> v_sid THEN
      RETURN jsonb_build_object('conflict', true, 'record', v_existing.payload);
    END IF;
    IF v_ms >= coalesce(v_existing.updated_at_ms, 0) THEN
      UPDATE public.apc_student_accounts
        SET student_id = coalesce(v_sid, student_id),
            username = coalesce(v_uname, username),
            mobile = coalesce(v_mobile, mobile),
            email = coalesce(v_email, email),
            status = v_status,
            payload = p_record,
            updated_at_ms = v_ms,
            updated_at = now()
        WHERE login_key = p_login_key
        RETURNING * INTO v_existing;
    END IF;
    RETURN jsonb_build_object('conflict', false, 'record', v_existing.payload);
  END IF;

  INSERT INTO public.apc_student_accounts (
    login_key, student_id, username, mobile, email, status, payload, updated_at_ms, updated_at
  ) VALUES (
    p_login_key, v_sid, v_uname, v_mobile, v_email, v_status, p_record, v_ms, now()
  ) RETURNING * INTO v_existing;

  RETURN jsonb_build_object('conflict', false, 'record', v_existing.payload);
END;
$$;

-- Atomic RPC 5: Atomic Student Registration (mirrors Firebase ID or allocates 9-digit YYMMDDSSS)
CREATE OR REPLACE FUNCTION public.apc_register_student_atomic(
  p_yymmdd text,
  p_preferred_id text,
  p_login_key text,
  p_username text,
  p_mobile text,
  p_email text,
  p_account jsonb,
  p_student_row jsonb,
  p_notification jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_serial integer;
  v_pref_serial integer := 0;
  v_student_id text;
  v_existing_owner text;
  v_account jsonb;
  v_row jsonb;
  v_notif jsonb;
  v_notif_id text;
  v_ms bigint;
BEGIN
  IF p_username IS NOT NULL AND length(trim(p_username)) > 0 THEN
    SELECT coalesce(claim->>'studentId', '') INTO v_existing_owner
      FROM public.apc_usernames
      WHERE username = lower(trim(p_username))
      FOR UPDATE;
    IF FOUND AND v_existing_owner <> '' AND v_existing_owner <> coalesce(p_preferred_id, '') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'duplicate-username');
    END IF;
  END IF;

  IF p_mobile IS NOT NULL AND length(trim(p_mobile)) > 0 THEN
    SELECT student_id INTO v_existing_owner
      FROM public.apc_identity_index
      WHERE kind = 'mobile' AND identifier = trim(p_mobile)
      FOR UPDATE;
    IF FOUND AND v_existing_owner <> coalesce(p_preferred_id, '') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'duplicate-mobile');
    END IF;
  END IF;

  IF p_email IS NOT NULL AND length(trim(p_email)) > 0 THEN
    SELECT student_id INTO v_existing_owner
      FROM public.apc_identity_index
      WHERE kind = 'email' AND identifier = lower(trim(p_email))
      FOR UPDATE;
    IF FOUND AND v_existing_owner <> coalesce(p_preferred_id, '') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'duplicate-email');
    END IF;
  END IF;

  IF p_preferred_id IS NOT NULL AND p_preferred_id ~ '^\d{9}$' THEN
    v_student_id := p_preferred_id;
    IF left(p_preferred_id, 6) = p_yymmdd THEN
      v_pref_serial := substring(p_preferred_id FROM 7 FOR 3)::integer;
      INSERT INTO public.apc_daily_counters (yymmdd, last_serial, updated_at)
      VALUES (p_yymmdd, v_pref_serial, now())
      ON CONFLICT (yymmdd) DO UPDATE
        SET last_serial = GREATEST(public.apc_daily_counters.last_serial, EXCLUDED.last_serial),
            updated_at = now();
    END IF;
  ELSE
    INSERT INTO public.apc_daily_counters (yymmdd, last_serial, updated_at)
    VALUES (p_yymmdd, 1, now())
    ON CONFLICT (yymmdd) DO UPDATE
      SET last_serial = public.apc_daily_counters.last_serial + 1,
          updated_at = now()
    RETURNING last_serial INTO v_serial;

    IF v_serial > 999 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'daily-limit-reached');
    END IF;
    v_student_id := p_yymmdd || lpad(v_serial::text, 3, '0');
  END IF;

  v_account := jsonb_set(p_account, '{studentId}', to_jsonb(v_student_id), true);
  IF jsonb_typeof(v_account->'student') = 'object' THEN
    v_account := jsonb_set(v_account, '{student,id}', to_jsonb(v_student_id), true);
  END IF;
  v_row := jsonb_set(p_student_row, '{id}', to_jsonb(v_student_id), true);
  v_ms := public.apc_record_time_ms(v_account);

  INSERT INTO public.apc_student_accounts (
    login_key, student_id, username, mobile, email, status, payload, updated_at_ms, updated_at
  ) VALUES (
    p_login_key,
    v_student_id,
    lower(nullif(trim(coalesce(p_username, '')), '')),
    nullif(trim(coalesce(p_mobile, '')), ''),
    lower(nullif(trim(coalesce(p_email, '')), '')),
    coalesce(v_account->>'status', 'pending'),
    v_account,
    v_ms,
    now()
  )
  ON CONFLICT (login_key) DO UPDATE
    SET student_id = EXCLUDED.student_id,
        payload = EXCLUDED.payload,
        status = EXCLUDED.status,
        updated_at_ms = EXCLUDED.updated_at_ms,
        updated_at = now();

  INSERT INTO public.apc_records (collection, record_id, payload, updated_at_ms, updated_at)
  VALUES ('students', v_student_id, v_row, public.apc_record_time_ms(v_row), now())
  ON CONFLICT (collection, record_id) DO UPDATE
    SET payload = EXCLUDED.payload,
        updated_at_ms = EXCLUDED.updated_at_ms,
        updated_at = now();

  IF p_username IS NOT NULL AND length(trim(p_username)) > 0 THEN
    INSERT INTO public.apc_usernames (username, claim, updated_at)
    VALUES (
      lower(trim(p_username)),
      jsonb_build_object('role', 'student', 'studentId', v_student_id, 'claimedAt', now()),
      now()
    )
    ON CONFLICT (username) DO UPDATE SET claim = EXCLUDED.claim, updated_at = now();
  END IF;

  IF p_mobile IS NOT NULL AND length(trim(p_mobile)) > 0 THEN
    INSERT INTO public.apc_identity_index (kind, identifier, student_id, claim, updated_at)
    VALUES ('mobile', trim(p_mobile), v_student_id, jsonb_build_object('studentId', v_student_id), now())
    ON CONFLICT (kind, identifier) DO UPDATE SET student_id = EXCLUDED.student_id, updated_at = now();
  END IF;

  IF p_email IS NOT NULL AND length(trim(p_email)) > 0 THEN
    INSERT INTO public.apc_identity_index (kind, identifier, student_id, claim, updated_at)
    VALUES ('email', lower(trim(p_email)), v_student_id, jsonb_build_object('studentId', v_student_id), now())
    ON CONFLICT (kind, identifier) DO UPDATE SET student_id = EXCLUDED.student_id, updated_at = now();
  END IF;

  IF p_notification IS NOT NULL AND jsonb_typeof(p_notification) = 'object' THEN
    v_notif_id := coalesce(nullif(trim(p_notification->>'id'), ''), 'reg-' || v_student_id);
    v_notif := jsonb_set(jsonb_set(p_notification, '{id}', to_jsonb(v_notif_id), true), '{studentId}', to_jsonb(v_student_id), true);
    INSERT INTO public.apc_notifications (notification_id, student_id, is_read, payload, created_at_iso, updated_at)
    VALUES (v_notif_id, v_student_id, coalesce((v_notif->>'read')::boolean, false), v_notif, v_notif->>'createdAt', now())
    ON CONFLICT (notification_id) DO UPDATE
      SET payload = EXCLUDED.payload,
          updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'studentId', v_student_id,
    'accountRecord', v_account,
    'studentRow', v_row
  );
END;
$$;

-- Atomic RPC 6: Factory Reset across all Supabase bridge tables
CREATE OR REPLACE FUNCTION public.apc_reset_cloud_database()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.apc_records;
  DELETE FROM public.apc_exam_db;
  DELETE FROM public.apc_usernames;
  DELETE FROM public.apc_identity_index;
  DELETE FROM public.apc_daily_counters;
  DELETE FROM public.apc_notifications;
  DELETE FROM public.apc_staff_directory;
  DELETE FROM public.apc_student_accounts;
  DELETE FROM public.apc_staff_accounts;
  DELETE FROM public.apc_system WHERE key = 'adminInitialized';
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.apc_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apc_exam_db ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apc_staff_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apc_staff_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apc_student_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apc_usernames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apc_identity_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apc_daily_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apc_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apc_system ENABLE ROW LEVEL SECURITY;

-- Interim bridge RLS policies (matching Firebase RTDB interim rules while CHECK constraints reject plaintext secrets)
CREATE POLICY apc_records_bridge_policy ON public.apc_records FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY apc_exam_db_bridge_policy ON public.apc_exam_db FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY apc_staff_accounts_bridge_policy ON public.apc_staff_accounts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY apc_staff_directory_bridge_policy ON public.apc_staff_directory FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY apc_student_accounts_bridge_policy ON public.apc_student_accounts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY apc_usernames_bridge_policy ON public.apc_usernames FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY apc_identity_index_bridge_policy ON public.apc_identity_index FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY apc_daily_counters_bridge_policy ON public.apc_daily_counters FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY apc_notifications_bridge_policy ON public.apc_notifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY apc_system_bridge_policy ON public.apc_system FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- Replica Identity & Realtime Publication for live cross-device push
ALTER TABLE public.apc_records REPLICA IDENTITY FULL;
ALTER TABLE public.apc_exam_db REPLICA IDENTITY FULL;
ALTER TABLE public.apc_staff_accounts REPLICA IDENTITY FULL;
ALTER TABLE public.apc_staff_directory REPLICA IDENTITY FULL;
ALTER TABLE public.apc_student_accounts REPLICA IDENTITY FULL;
ALTER TABLE public.apc_usernames REPLICA IDENTITY FULL;
ALTER TABLE public.apc_notifications REPLICA IDENTITY FULL;
ALTER TABLE public.apc_system REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.apc_records,
  public.apc_exam_db,
  public.apc_staff_accounts,
  public.apc_staff_directory,
  public.apc_student_accounts,
  public.apc_usernames,
  public.apc_notifications,
  public.apc_system;
