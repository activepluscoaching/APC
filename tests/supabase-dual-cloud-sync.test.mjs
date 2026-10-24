import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { resolveSupabaseConfig, productionSupabaseConfig } from '../sync/supabase-config.js';
import { hashPassword } from '../js/password-hash.js';
import { KEYS } from '../js/database.js';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';
import { buildSessionRecord } from '../js/session.js';

function createMemorySupabaseClient() {
  const tables = {
    apc_records: [],
    apc_exam_db: [],
    apc_staff_accounts: [],
    apc_staff_directory: [],
    apc_student_accounts: [],
    apc_usernames: [],
    apc_identity_index: [],
    apc_daily_counters: [],
    apc_notifications: [],
    apc_system: []
  };

  function makeQuery(tableName) {
    const state = {
      mode: 'select',
      filters: [],
      inFilter: null,
      upsertRows: null,
      upsertOpts: {}
    };

    const run = async () => {
      const rows = tables[tableName] || [];
      const matches = row => {
        for (const [col, val] of state.filters) {
          if (row[col] !== val) return false;
        }
        if (state.inFilter) {
          const [col, vals] = state.inFilter;
          if (!vals.includes(row[col])) return false;
        }
        return true;
      };

      if (state.mode === 'upsert') {
        const list = Array.isArray(state.upsertRows) ? state.upsertRows : [state.upsertRows];
        const conflictCols = String(state.upsertOpts?.onConflict || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        for (const incoming of list) {
          const idx = conflictCols.length
            ? rows.findIndex(r => conflictCols.every(c => r[c] === incoming[c]))
            : -1;
          if (idx >= 0) {
            if (!state.upsertOpts?.ignoreDuplicates) {
              rows[idx] = { ...rows[idx], ...incoming };
            }
          } else {
            rows.push({ ...incoming });
          }
        }
        return { data: list, error: null };
      }

      if (state.mode === 'delete') {
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (matches(rows[i])) rows.splice(i, 1);
        }
        return { data: null, error: null };
      }

      return { data: rows.filter(matches).map(r => ({ ...r })), error: null };
    };

    const builder = {
      select() { state.mode = 'select'; return builder; },
      upsert(rowsToWrite, opts = {}) {
        state.mode = 'upsert';
        state.upsertRows = rowsToWrite;
        state.upsertOpts = opts;
        return builder;
      },
      delete() { state.mode = 'delete'; return builder; },
      eq(col, val) { state.filters.push([col, val]); return builder; },
      in(col, vals) { state.inFilter = [col, vals]; return builder; },
      order() { return builder; },
      async maybeSingle() {
        const res = await run();
        return { data: res.data?.[0] || null, error: res.error };
      },
      then(onFulfilled, onRejected) {
        return run().then(onFulfilled, onRejected);
      }
    };
    return builder;
  }

  return {
    tables,
    from(tableName) {
      return makeQuery(tableName);
    },
    channel() {
      const ch = {
        on() { return ch; },
        subscribe(cb) { if (cb) cb('SUBSCRIBED'); return ch; }
      };
      return ch;
    },
    removeChannel() {},
    async rpc(fnName, params = {}) {
      if (fnName === 'apc_merge_collection_ops') {
        const col = params.p_collection;
        const ops = params.p_ops || {};
        for (const [id, op] of Object.entries(ops)) {
          const idx = tables.apc_records.findIndex(r => r.collection === col && r.record_id === id);
          if (!op || op.value === null) {
            if (idx >= 0) tables.apc_records.splice(idx, 1);
          } else if (idx >= 0) {
            tables.apc_records[idx].payload = op.value;
          } else {
            tables.apc_records.push({ collection: col, record_id: id, payload: op.value });
          }
        }
        const snap = {};
        for (const r of tables.apc_records) {
          if (r.collection === col) snap[r.record_id] = r.payload;
        }
        return { data: snap, error: null };
      }

      if (fnName === 'apc_claim_first_admin') {
        const exists = tables.apc_staff_accounts.some(r => r.role === 'admin') ||
          tables.apc_system.some(r => r.key === 'adminInitialized' && r.value === true);
        if (exists) return { data: { committed: false, reason: 'admin-exists' }, error: null };
        const rec = params.p_record;
        tables.apc_staff_accounts.push({ role: 'admin', username: rec.username, payload: rec });
        tables.apc_system.push({ key: 'adminInitialized', value: true });
        return { data: { committed: true }, error: null };
      }

      if (fnName === 'apc_upsert_student_account') {
        const key = params.p_login_key;
        const rec = params.p_record;
        if (rec.pin || rec.securityAnswer) {
          return { data: null, error: new Error('plaintext-secret-rejected') };
        }
        const idx = tables.apc_student_accounts.findIndex(r => r.login_key === key);
        const row = {
          login_key: key,
          student_id: rec.student?.id || rec.studentId || null,
          username: rec.username || rec.student?.username || null,
          mobile: rec.registrationMobile || rec.mobile || null,
          status: rec.status || 'pending',
          payload: rec
        };
        if (idx >= 0) tables.apc_student_accounts[idx] = row;
        else tables.apc_student_accounts.push(row);
        return { data: { conflict: false, record: rec }, error: null };
      }

      if (fnName === 'apc_register_student_atomic') {
        const {
          p_yymmdd,
          p_preferred_id,
          p_login_key,
          p_username,
          p_mobile,
          p_email,
          p_account,
          p_student_row,
          p_notification
        } = params;
        if (p_account?.pin || p_account?.securityAnswer) {
          return { data: null, error: new Error('plaintext-secret-rejected') };
        }
        if (p_username && tables.apc_usernames.some(u => u.username === p_username && u.claim?.studentId !== p_preferred_id)) {
          return { data: { ok: false, reason: 'duplicate-username' }, error: null };
        }
        if (p_mobile && tables.apc_identity_index.some(i => i.kind === 'mobile' && i.identifier === p_mobile && i.student_id !== p_preferred_id)) {
          return { data: { ok: false, reason: 'duplicate-mobile' }, error: null };
        }
        if (p_email && tables.apc_identity_index.some(i => i.kind === 'email' && i.identifier === p_email && i.student_id !== p_preferred_id)) {
          return { data: { ok: false, reason: 'duplicate-email' }, error: null };
        }

        let studentId = p_preferred_id;
        if (!studentId) {
          let ctr = tables.apc_daily_counters.find(c => c.yymmdd === p_yymmdd);
          if (!ctr) { ctr = { yymmdd: p_yymmdd, last_seq: 0 }; tables.apc_daily_counters.push(ctr); }
          ctr.last_seq += 1;
          studentId = `${p_yymmdd}${String(ctr.last_seq).padStart(3, '0')}`;
        }

        const finalRow = { ...p_student_row, id: studentId };
        const finalAcc = {
          ...p_account,
          studentId,
          student: { ...(p_account.student || {}), id: studentId }
        };

        if (p_username && !tables.apc_usernames.some(u => u.username === p_username)) {
          tables.apc_usernames.push({ username: p_username, claim: { studentId } });
        }
        if (p_mobile && !tables.apc_identity_index.some(i => i.kind === 'mobile' && i.identifier === p_mobile)) {
          tables.apc_identity_index.push({ kind: 'mobile', identifier: p_mobile, student_id: studentId });
        }
        if (p_email && !tables.apc_identity_index.some(i => i.kind === 'email' && i.identifier === p_email)) {
          tables.apc_identity_index.push({ kind: 'email', identifier: p_email, student_id: studentId });
        }

        const accIdx = tables.apc_student_accounts.findIndex(r => r.login_key === p_login_key);
        const accEntry = {
          login_key: p_login_key,
          student_id: studentId,
          username: p_username,
          mobile: p_mobile,
          status: finalAcc.status || 'pending',
          payload: finalAcc
        };
        if (accIdx >= 0) tables.apc_student_accounts[accIdx] = accEntry;
        else tables.apc_student_accounts.push(accEntry);

        const recIdx = tables.apc_records.findIndex(r => r.collection === 'students' && r.record_id === studentId);
        if (recIdx >= 0) tables.apc_records[recIdx].payload = finalRow;
        else tables.apc_records.push({ collection: 'students', record_id: studentId, payload: finalRow });

        if (p_notification) {
          tables.apc_notifications.push({
            notification_id: p_notification.id || `reg-${studentId}`,
            student_id: studentId,
            is_read: false,
            payload: { ...p_notification, studentId }
          });
        }

        return {
          data: { ok: true, studentId, studentRow: finalRow, accountRecord: finalAcc },
          error: null
        };
      }

      if (fnName === 'apc_reset_cloud_database') {
        for (const k of Object.keys(tables)) tables[k].length = 0;
        return { data: { ok: true }, error: null };
      }

      return { data: null, error: new Error('unknown-rpc:' + fnName) };
    }
  };
}

test('Supabase config selects production on live hosts and fails closed on preview hosts', () => {
  assert.match(productionSupabaseConfig.url, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  assert.match(productionSupabaseConfig.publishableKey, /^sb_publishable_/);

  const githubPages = resolveSupabaseConfig({ hostname: 'activepluscoaching.github.io', storage: null });
  assert.equal(githubPages.environment, 'prod');
  assert.equal(githubPages.configured, true);
  assert.equal(githubPages.config.projectRef, 'orrinivkfioolkekerkh');

  const netlifyProd = resolveSupabaseConfig({ hostname: 'activepluscoaching.netlify.app', storage: null });
  assert.equal(netlifyProd.environment, 'prod');
  assert.equal(netlifyProd.configured, true);

  const preview = resolveSupabaseConfig({ hostname: '4173-sandbox123.e2b.app', storage: null });
  assert.equal(preview.environment, 'dev');
  assert.equal(preview.configured, false);

  assert.throws(
    () => resolveSupabaseConfig({ hostname: '4173-sandbox123.e2b.app', search: '?supabaseProject=prod', storage: null }),
    /Production Supabase is forbidden/
  );
});

test('Both Firebase and Supabase SDKs, CSP rules, Service Worker entries, and Netlify config coexist', () => {
  assert.ok(existsSync('vendor/firebase/sdk.js'), 'Firebase SDK bundle remains intact');
  assert.ok(existsSync('vendor/supabase/sdk.js'), 'Supabase SDK bundle is present');
  assert.ok(existsSync('netlify.toml'), 'netlify.toml deployment config is present');
  assert.ok(existsSync('supabase/migrations/20261024000001_active_plus_dual_sync.sql'), 'Supabase SQL migration is present');

  const sw = readFileSync('sw.js', 'utf8');
  assert.match(sw, /'\.\/vendor\/firebase\/sdk\.js'/);
  assert.match(sw, /'\.\/vendor\/supabase\/sdk\.js'/);
  assert.match(sw, /'\.\/js\/supabase-sync\.js'/);
  assert.match(sw, /firebaseio\\\.com.*supabase\\\.co/);

  const netlify = readFileSync('netlify.toml', 'utf8');
  assert.match(netlify, /npm run build:firebase && npm run build:supabase/);
  assert.match(netlify, /https:\/\/\*\.firebaseio\.com/);
  assert.match(netlify, /https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/);

  for (const page of ['index.html', 'student.html', 'admin.html', 'manager.html', 'teacher.html', 'payment.html']) {
    const html = readFileSync(page, 'utf8');
    assert.match(html, /https:\/\/\*\.firebasedatabase\.app/, `${page} retains Firebase CSP`);
    assert.match(html, /https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/, `${page} includes Supabase CSP`);
  }
});

test('Supabase sync engine replicates collections, claims first admin, registers students atomically, and hydrates login', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://activepluscoaching.github.io/APC/' });
  const prevGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    Storage: globalThis.Storage,
    navigator: globalThis.navigator,
    location: globalThis.location,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent
  };

  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: dom.window.sessionStorage, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'Storage', { value: dom.window.Storage, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'location', { value: dom.window.location, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'Event', { value: dom.window.Event, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'CustomEvent', { value: dom.window.CustomEvent, configurable: true, writable: true });

  const mockClient = createMemorySupabaseClient();
  globalThis.__APC_SUPABASE_TEST_CLIENT__ = mockClient;

  try {
    const sb = await import('../js/supabase-sync.js');

    // 1. Atomic First Admin Claim
    const adminPass = await hashPassword('AdminStrong#2026');
    const adminRecord = {
      username: 'principal.admin.apc',
      name: 'প্রধান পরিচালক',
      role: 'admin',
      password: adminPass,
      updatedAt: '2026-10-24T10:00:00.000Z'
    };
    const claim1 = await sb.claimFirstAdminAccountSupabase(adminRecord);
    assert.equal(claim1.ok, true);
    const claim2 = await sb.claimFirstAdminAccountSupabase(adminRecord);
    assert.equal(claim2.ok, false);
    assert.equal(claim2.reason, 'admin-exists');

    const initCheck = await sb.adminInitializationStateSupabase();
    assert.equal(initCheck.ok, true);
    assert.equal(initCheck.initialized, true);

    // 2. Atomic Student Registration + Duplicate Protection + Zero Plaintext Secrets
    const pinHash = await hashPassword('SecretPin#99');
    const reg = await sb.registerStudentAtomicallySupabase({
      mobile: '01712345678',
      username: 'rahim.26',
      email: 'rahim@example.com',
      buildRecords: async ({ studentId }) => ({
        studentRow: {
          id: studentId,
          name: 'রহিম উদ্দিন',
          username: 'rahim.26',
          className: 'দশম শ্রেণি',
          mobile: '01712345678',
          status: 'pending',
          updatedAt: '2026-10-24T10:05:00.000Z'
        },
        cloudAccount: {
          username: 'rahim.26',
          registrationMobile: '01712345678',
          pin: 'SHOULD_BE_STRIPPED',
          pinHash,
          status: 'pending',
          student: { id: studentId, name: 'রহিম উদ্দিন', username: 'rahim.26', status: 'pending' },
          updatedAt: '2026-10-24T10:05:00.000Z'
        },
        notificationRecord: {
          id: `reg-${studentId}`,
          studentId,
          title: 'নতুন শিক্ষার্থী আবেদন',
          createdAt: '2026-10-24T10:05:00.000Z'
        }
      })
    });
    assert.equal(reg.ok, true);
    assert.match(reg.studentId, /^\d{6}001$/);
    assert.equal(mockClient.tables.apc_student_accounts[0].payload.pin, undefined, 'plaintext PIN never reaches Supabase');

    const dup = await sb.registerStudentAtomicallySupabase({
      mobile: '01899999999',
      username: 'rahim.26',
      buildRecords: async ({ studentId }) => ({
        studentRow: { id: studentId, name: 'Duplicate', status: 'pending' },
        cloudAccount: { username: 'rahim.26', pinHash, status: 'pending' }
      })
    });
    assert.equal(dup.ok, false);
    assert.equal(dup.reason, 'duplicate');
    assert.equal(dup.field, 'username');

    // 3. Cross-Device Student Login Hydration from Supabase
    localStorage.removeItem(KEYS.account);
    const wrongPass = await sb.hydrateUserIdentifiersSupabase({ identifier: 'rahim.26', password: 'WrongPassword1!' });
    assert.equal(wrongPass.ok, true);
    assert.equal(wrongPass.credentialMismatch, true);
    assert.equal(localStorage.getItem(KEYS.account), null);

    const rightPass = await sb.hydrateUserIdentifiersSupabase({ identifier: 'rahim.26', password: 'SecretPin#99' });
    assert.equal(rightPass.ok, true);
    assert.equal(rightPass.found, true);
    const hydratedAcc = JSON.parse(localStorage.getItem(KEYS.account));
    assert.equal(hydratedAcc.student.id, reg.studentId);

    // 4. Collection Sync (Admin session active -> notices & students sync bidirectionally)
    localStorage.setItem(STAFF_ACCOUNTS.admin.accountKey, JSON.stringify(adminRecord));
    const adminSession = await buildSessionRecord({ role: 'admin', ttlDays: 7 });
    sessionStorage.setItem(STAFF_ACCOUNTS.admin.sessionKey, '1');
    localStorage.setItem(STAFF_ACCOUNTS.admin.sessionKey, JSON.stringify(adminSession));
    localStorage.setItem(KEYS.notices, JSON.stringify([
      { id: 'notice-1', title: 'স্বাগতম নোটিশ', body: 'আগামীকাল ক্লাস খোলা', updatedAt: '2026-10-24T10:10:00.000Z' }
    ]));

    const startRes = await sb.startSupabaseSync();
    assert.equal(startRes.ok, true);
    assert.equal(document.documentElement.dataset.supabaseConnection, 'connected');

    const remoteNotice = mockClient.tables.apc_records.find(r => r.collection === 'notices' && r.record_id === 'notice-1');
    assert.ok(remoteNotice, 'local notice pushed to Supabase apc_records');
    assert.equal(remoteNotice.payload.title, 'স্বাগতম নোটিশ');

    const syncedStudents = JSON.parse(localStorage.getItem(KEYS.students));
    assert.ok(Array.isArray(syncedStudents) && syncedStudents.some(s => s.id === reg.studentId), 'remote student pulled from Supabase');

    sb.stopSupabaseSync();
  } finally {
    delete globalThis.__APC_SUPABASE_TEST_CLIENT__;
    dom.window.close();
    for (const [k, v] of Object.entries(prevGlobals)) {
      if (v === undefined) delete globalThis[k];
      else Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
    }
  }
});
