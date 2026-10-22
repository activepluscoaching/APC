import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadPage } from './jsdom-harness.mjs';
import { KEYS, STAFF_KEYS } from '../js/database.js';

const values = new Map();
const listeners = new Set();

const UNDEPLOYED_PREFIXES = [
  'activePlusSync/v1/classChat',
  'activePlusSync/v1/notifications',
  'activePlusSync/v1/mobileIndex',
  'activePlusSync/v1/emailIndex',
  'activePlusSync/v1/dailyStudentCounters'
];

function isBlockedPath(path) {
  const clean = String(path || '');
  return UNDEPLOYED_PREFIXES.some(prefix => clean === prefix || clean.startsWith(prefix + '/'));
}

function permissionDenied(path) {
  return Object.assign(new Error(`PERMISSION_DENIED: Permission denied at ${path}`), {
    code: 'PERMISSION_DENIED'
  });
}

function readNode(path) {
  const clean = String(path || '');
  const direct = values.has(clean) ? JSON.parse(JSON.stringify(values.get(clean))) : undefined;
  const prefix = clean + '/';
  let childObj = null;
  for (const [k, v] of values.entries()) {
    if (k.startsWith(prefix) && v !== null && v !== undefined) {
      const rest = k.slice(prefix.length).split('/')[0];
      childObj ??= {};
      childObj[rest] = JSON.parse(JSON.stringify(v));
    }
  }
  if (direct !== undefined && direct !== null && typeof direct === 'object' && !Array.isArray(direct) && childObj) {
    return { ...direct, ...childObj };
  }
  if (direct !== undefined) return direct;
  return childObj;
}

function writeNode(path, val) {
  const clean = String(path || '');
  const resolved = val && typeof val === 'object' && val.at && val.at['.sv'] === 'timestamp'
    ? { ...val, at: Date.parse('2026-10-22T09:00:00Z') }
    : val;
  if (resolved === null || resolved === undefined) {
    values.delete(clean);
    for (const k of [...values.keys()]) {
      if (k.startsWith(clean + '/')) values.delete(k);
    }
  } else {
    values.set(clean, JSON.parse(JSON.stringify(resolved)));
  }
  for (const l of listeners) {
    if (l.stopped) continue;
    if (l.path === clean || clean.startsWith(l.path + '/') || l.path.startsWith(clean + '/')) {
      queueMicrotask(() => {
        if (!l.stopped) l.callback(snapshot(l.path));
      });
    }
  }
}

const snapshot = path => {
  const v = readNode(path);
  return {
    exists: () => v !== null && v !== undefined,
    val: () => (v !== null && v !== undefined ? JSON.parse(JSON.stringify(v)) : null)
  };
};

const auth = { currentUser: null, authStateReady: async () => {} };

const transport = {
  firebaseApp: {},
  appCheckReady: Promise.resolve(),
  getAuth: () => auth,
  signInAnonymously: async () => {
    auth.currentUser = { uid: 'live-device-1' };
    return { user: auth.currentUser };
  },
  signInWithEmailAndPassword: async () => { throw new Error('not used'); },
  updatePassword: async () => {},
  setPersistence: async () => {},
  browserLocalPersistence: {},
  getDatabase: () => ({}),
  ref: (_db, path) => String(path),
  get: async path => {
    if (isBlockedPath(path)) throw permissionDenied(path);
    return snapshot(path);
  },
  set: async (path, value) => {
    if (isBlockedPath(path)) throw permissionDenied(path);
    writeNode(path, value);
  },
  runTransaction: async (path, update) => {
    if (isBlockedPath(path)) throw permissionDenied(path);
    const cur = readNode(path);
    const next = update(cur !== null && cur !== undefined ? JSON.parse(JSON.stringify(cur)) : null);
    if (next === undefined) return { committed: false, snapshot: snapshot(path) };
    writeNode(path, next);
    return { committed: true, snapshot: snapshot(path) };
  },
  onValue: (path, callback, onError) => {
    const listener = { path: String(path), callback, onError, stopped: false };
    listeners.add(listener);
    queueMicrotask(() => {
      if (listener.stopped) return;
      if (isBlockedPath(path)) {
        listener.onError?.(permissionDenied(path));
        return;
      }
      if (path === '.info/connected') {
        listener.callback({ val: () => true });
      } else {
        listener.callback(snapshot(path));
      }
    });
    return () => {
      listener.stopped = true;
      listeners.delete(listener);
    };
  }
};

let hooks = null;
before(() => {
  globalThis.__apcPredeployTransport = transport;
  hooks = registerHooks({
    load(url, context, nextLoad) {
      if (url.endsWith('/firebase/firebase-init.js') || url.endsWith('/firebase/firebase-services.js')) {
        return {
          format: 'module',
          shortCircuit: true,
          source: `export const { ${Object.keys(transport).join(', ')} } = globalThis.__apcPredeployTransport;`
        };
      }
      return nextLoad(url, context);
    }
  });
});

after(() => {
  hooks?.deregister?.();
  delete globalThis.__apcPredeployTransport;
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('topbar stays green (synced) and realtime sync + atomic registration work even before new RTDB rules are deployed', async () => {
  const ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  globalThis.Storage = ctx.window.Storage;

  // Evaluate topbar-connectivity.js in the page window so data-sync-visual updates live
  ctx.window.eval(readFileSync(new URL('../js/topbar-connectivity.js', import.meta.url), 'utf8'));

  // Seed active student + reviewer session so BOTH classChat and notifications paths are exercised
  const storage = await import('../js/storage.js');
  await storage.persistAccount({
    username: 'active.student',
    mobile: '01711223344',
    pin: '123456',
    status: 'active',
    student: { id: '261022001', name: 'সচল শিক্ষার্থী', className: 'দশম শ্রেণি' }
  });
  await storage.persistSession(true);
  ctx.window.sessionStorage.setItem(STAFF_KEYS.adminSession, JSON.stringify({ role: 'admin', at: Date.now() }));

  const sync = await import('../js/realtime-sync.js');
  const boot = await sync.startRealtimeSync();
  assert.equal(boot.ok, true, 'startRealtimeSync succeeds despite undeployed optional nodes');

  await sleep(80);
  const root = ctx.document.documentElement;
  assert.equal(root.dataset.realtimeSync, 'online', 'realtimeSync state reaches online, never error');
  assert.equal(root.dataset.syncVisual, 'synced', 'topbar visual state turns green (synced), never red (error)');

  // Outbox flush works cleanly when local notices/students change (not blocked by classChat PERMISSION_DENIED)
  ctx.window.localStorage.setItem(KEYS.notices, JSON.stringify([
    { id: 'notice-live-1', title: 'জরুরি নোটিশ', body: 'আগামীকাল পরীক্ষা', status: 'published', updatedAt: '2026-10-22T09:05:00.000Z' }
  ]));
  await sleep(120);
  assert.ok(values.get('activePlusSync/v1/notices')?.['notice-live-1'], 'core collection notice synced to Firebase immediately');
  assert.equal(root.dataset.syncVisual, 'synced', 'topbar stays green after outbox flush');

  // Class Chat ALSO syncs encrypted envelopes via pre-deploy fallback relay (`routine/__apcClassChatRelayV1`)
  const { sendClassMessage } = await import('../js/class-chat.js');
  sendClassMessage({
    className: 'দশম শ্রেণি',
    text: 'স্যার, আজকের ক্লাস কখন শুরু হবে?',
    actor: { id: '261022001', name: 'সচল শিক্ষার্থী', role: 'student', className: 'দশম শ্রেণি', status: 'approved' }
  });
  await sleep(200);
  const fallbackChatRelay = readNode('activePlusSync/v1/routine/__apcClassChatRelayV1');
  assert.equal(fallbackChatRelay?._syncKind, 'chat-relay', 'Class Chat automatically uses deployed fallback relay node when classChat node returns PERMISSION_DENIED');
  assert.ok(Object.keys(fallbackChatRelay?.entries || {}).some(k => k.startsWith('msg-')), 'Encrypted chat message envelope pushed to cloud');
  assert.equal(root.dataset.syncVisual, 'synced', 'topbar remains green after Class Chat send');

  // Online atomic registration falls back to legacy allowed nodes (usernames + students + studentAccounts)
  const regResult = await sync.registerStudentAtomicallyOnline({
    mobile: '01812345678',
    username: 'new.rahim',
    email: 'rahim@example.com',
    buildRecords: async ({ studentId, serverMs }) => {
      const createdAt = new Date(serverMs).toISOString();
      const acc = await storage.persistAccount({
        username: 'new.rahim',
        mobile: '01812345678',
        registrationMobile: '01812345678',
        email: 'rahim@example.com',
        pin: '654321',
        status: 'pending',
        studentId,
        student: { id: studentId, name: 'রহিম উদ্দিন', className: 'নবম শ্রেণি' },
        createdAt
      }, { isNewRegistration: true });
      return {
        studentRow: {
          id: studentId,
          name: 'রহিম উদ্দিন',
          mobile: '01812345678',
          registrationMobile: '01812345678',
          username: 'new.rahim',
          email: 'rahim@example.com',
          status: 'pending',
          accountStatus: 'pending',
          createdAt
        },
        cloudAccount: acc,
        notificationRecord: {
          id: `reg-${studentId}`,
          type: 'new_registration',
          studentId,
          studentName: 'রহিম উদ্দিন',
          mobile: '01812345678',
          createdAt,
          read: false
        }
      };
    }
  });
  assert.equal(regResult.ok, true, 'atomic registration succeeds via legacy-compatible RTDB nodes');
  assert.match(regResult.studentId, /^\d{9}$/, 'allocates 9-digit YYMMDDSSS ID');
  assert.equal(values.get('activePlusSync/v1/students')?.[regResult.studentId]?.status, 'pending');

  // Duplicate mobile is still rejected atomically
  const dupMobile = await sync.registerStudentAtomicallyOnline({
    mobile: '01812345678',
    username: 'other.user',
    email: '',
    buildRecords: async () => { throw new Error('must not build on duplicate'); }
  });
  assert.equal(dupMobile.ok, false);
  assert.equal(dupMobile.reason, 'duplicate');
  assert.equal(dupMobile.field, 'mobile');

  // Reviewer poll & approval decision still work cleanly without failing on notifications PERMISSION_DENIED
  const poll = await sync.pollRegistrationFeedOnline();
  assert.equal(poll.ok, true);

  const decision = await sync.syncRegistrationDecisionOnline({
    studentId: regResult.studentId,
    studentRow: {
      id: regResult.studentId,
      name: 'রহিম উদ্দিন',
      username: 'new.rahim',
      status: 'approved',
      accountStatus: 'active',
      approvedBy: 'admin',
      approvedAt: '2026-10-22T09:10:00.000Z'
    },
    decision: 'approved',
    approvedBy: 'admin',
    approvedAt: '2026-10-22T09:10:00.000Z'
  });
  assert.equal(decision.ok, true, 'approval decision syncs to students + studentAccounts cleanly');
  assert.equal(values.get('activePlusSync/v1/studentAccounts/new%2Erahim')?.status, 'active');
  assert.equal(root.dataset.syncVisual, 'synced', 'topbar remains green throughout');

  sync.stopRealtimeSync();
  ctx.window.close();
});
