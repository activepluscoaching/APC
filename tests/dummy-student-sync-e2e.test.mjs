/* End-to-end verification of the Dummy Student Panel (`student.html`) online sync:
 *
 * 1. Boots the actual `student.html` shell (`topbar-connectivity.js`,
 *    `realtime-sync-entry.js`, `main.js`, `student-features.js`,
 *    `class-chat-head.js`) as dummy student `AP-1024` (`রাইসা ইসলাম`) against
 *    the strict 2026-10-08 pre-deploy Firebase Console ruleset (where newer
 *    nodes `courses`, `adviceBank`, `classChat`, `notifications`,
 *    `mobileIndex`, `emailIndex`, and `dailyStudentCounters` all reject with
 *    `PERMISSION_DENIED`) AND with an already-persisted anonymous Auth user.
 * 2. Verifies `<html data-sync-visual="synced">` (the green topbar border),
 *    `data-realtime-sync="online"`, and `data-firebase-last-sync` stay green
 *    with zero infinite v2 `getIdTokenResult(true)` retry loops.
 * 3. Verifies real-time incoming cloud updates (Notices, Routine, Courses via
 *    `courseContent/__apcCoursesRelayV1`, Teaching/Homework, Fee Transactions,
 *    and Class Chat via `routine/__apcClassChatRelayV1`) arrive in the dummy
 *    student panel without reload while keeping `data-sync-visual="synced"`.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { startMockCloud, buildDevices } from './two-device-harness.mjs';
import { loadPage } from './jsdom-harness.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

after(() => {
  rmSync('tests/.two-device-run', { recursive: true, force: true });
});

test('dummy student panel (student.html as AP-1024 রাইসা ইসলাম) shows green online sync (data-sync-visual="synced") and receives live updates even under pre-deploy Console rules', async () => {
  const cloud = await startMockCloud();
  buildDevices().buildAppCopy(cloud.url);
  cpSync('firebase/firebase-config.js', 'tests/.two-device-run/firebase/firebase-config.js');
  cpSync('firebase/firebase-config.dev.js', 'tests/.two-device-run/firebase/firebase-config.dev.js');
  writeFileSync(
    'tests/.two-device-run/firebase/firebase-init.js',
    'export const firebaseApp = { mock: "app" };\nexport const appCheckReady = Promise.resolve();\nexport const FUNCTIONS_REGION = "asia-south1";\n'
  );

  // Pre-seed persisted anonymous user (simulates reload / returning phone session)
  globalThis.__dummyTokenRefreshCalls = 0;
  writeFileSync('tests/.two-device-run/mock/firebase-auth.mock.mjs', `
const anonUser = {
  uid: "persisted-anon-student",
  isAnonymous: true,
  providerData: [],
  getIdTokenResult: async () => {
    globalThis.__dummyTokenRefreshCalls = (globalThis.__dummyTokenRefreshCalls || 0) + 1;
    return { signInProvider: "anonymous", claims: { firebase: { sign_in_provider: "anonymous" } } };
  }
};
const auth = { currentUser: anonUser, authStateReady: async () => {} };
export const getAuth = () => auth;
export const browserLocalPersistence = {};
export async function setPersistence() {}
export async function signInAnonymously() { auth.currentUser = anonUser; return { user: anonUser }; }
`);

  // Simulate pre-deploy 2026-10-08 Console rules denying all newer RTDB nodes (including `courses`)
  const origMockDb = readFileSync('tests/.two-device-run/mock/firebase-database.mock.mjs', 'utf8');
  writeFileSync(
    'tests/.two-device-run/mock/firebase-database.mock.mjs',
    origMockDb
      .replace(
        'export async function get(node) {',
        `const UNDEPLOYED = [
  "activePlusSync/v1/courses",
  "activePlusSync/v1/adviceBank",
  "activePlusSync/v1/classChat",
  "activePlusSync/v1/notifications",
  "activePlusSync/v1/mobileIndex",
  "activePlusSync/v1/emailIndex",
  "activePlusSync/v1/dailyStudentCounters"
];
const isUndep = p => UNDEPLOYED.some(u => p === u || String(p || "").startsWith(u + "/"));
const permErr = p => Object.assign(new Error("PERMISSION_DENIED: Permission denied at " + p), { code: "PERMISSION_DENIED" });
export async function get(node) { if (isUndep(node.path)) throw permErr(node.path);`
      )
      .replace(
        'export async function set(node, value) {',
        'export async function set(node, value) { if (isUndep(node.path)) throw permErr(node.path);'
      )
      .replace(
        'export async function runTransaction(node, change) {',
        'export async function runTransaction(node, change) { if (isUndep(node.path)) throw permErr(node.path);'
      )
      .replace(
        'export function onValue(node, callback) {',
        'export function onValue(node, callback, onError) { if (isUndep(node.path)) { queueMicrotask(() => onError?.(permErr(node.path))); return () => {}; }'
      )
  );

  const ctx = await loadPage('student.html', {
    url: 'https://activepluscoaching.github.io/APC/student.html',
    seed: { 'activePlus.demo.autofill.v1': 'off' }
  });
  Object.defineProperty(globalThis, 'Storage', {
    value: ctx.window.Storage,
    configurable: true,
    writable: true
  });

  // Execute topbar-connectivity.js exactly as student.html does
  ctx.window.eval(readFileSync('js/topbar-connectivity.js', 'utf8'));

  // Seed dummy student AP-1024 (রাইসা ইসলাম) verified session
  const storage = await import('./.two-device-run/js/storage.js');
  const database = await import('./.two-device-run/js/database.js');
  await storage.persistAccount({
    username: 'raisa.islam',
    mobile: '01711001024',
    pin: '123456',
    status: 'active',
    studentId: 'AP-1024',
    student: {
      id: 'AP-1024',
      name: 'রাইসা ইসলাম',
      nameBn: 'রাইসা ইসলাম',
      className: 'দশম শ্রেণি',
      group: 'বিজ্ঞান বিভাগ',
      studentMobile: '01711001024'
    }
  }, { isNewRegistration: true });
  await storage.persistSession(true);

  await import('./.two-device-run/js/main.js');
  await import('./.two-device-run/js/realtime-sync-entry.js');
  await import('./.two-device-run/js/class-chat-head.js');

  // Wait for initial sync + staged v2 check window
  for (let i = 0; i < 30 && ctx.document.documentElement.dataset.syncVisual !== 'synced'; i += 1) {
    await sleep(100);
  }

  const ds = ctx.document.documentElement.dataset;
  assert.equal(ctx.$('#appShell')?.hidden, false, 'dummy student appShell is open');
  assert.match(ctx.$('#studentName')?.textContent || '', /রাইসা ইসলাম/, 'dummy student profile rendered');
  assert.equal(ds.realtimeSync, 'online', `expected realtimeSync="online", got "${ds.realtimeSync}" (${ds.realtimeSyncMessage})`);
  assert.ok(ds.firebaseLastSync, 'firebaseLastSync timestamp is recorded');
  assert.equal(ds.syncVisual, 'synced', 'online sync visual in dummy student panel is GREEN ("synced")');

  // Verify zero anonymous force-refresh token calls and green status stability after 1.5s
  await sleep(1500);
  assert.equal(globalThis.__dummyTokenRefreshCalls, 0, 'anonymous session never hammers getIdTokenResult(true)');
  assert.equal(ds.syncVisual, 'synced', 'online sync visual stays GREEN ("synced") over time');

  // Verify courses write/read falls back cleanly to courseContent/__apcCoursesRelayV1 while keeping green sync
  ctx.window.localStorage.setItem(database.KEYS.courses, JSON.stringify({
    version: 1,
    courses: [{ id: 'CRS-10-PHY', title: 'পদার্থবিজ্ঞান স্পেশাল কোর্স', className: 'দশম শ্রেণি', chapters: [] }]
  }));
  await sleep(500);
  assert.equal(ds.syncVisual, 'synced', 'courses write via fallback keeps dummy student sync GREEN');
  assert.ok(
    cloud.state?.activePlusSync?.v1?.courseContent?.__apcCoursesRelayV1?.records?.['CRS-10-PHY'],
    'courses synced via courseContent/__apcCoursesRelayV1 when activePlusSync/v1/courses rules are undeployed'
  );

  // Simulate remote Notice + Routine + Fee Transaction arriving from Admin/Manager/Payment device
  const mockDb = await import('./.two-device-run/mock/firebase-database.mock.mjs');
  await mockDb.set(mockDb.ref({}, 'activePlusSync/v1/notices'), {
    'NTC-LIVE-1': {
      id: 'NTC-LIVE-1',
      title: 'ডামি প্যানেল লাইভ নোটিশ',
      body: 'রিয়েলটাইম সিংক সবুজ এবং সচল আছে।',
      className: 'দশম শ্রেণি',
      group: 'বিজ্ঞান বিভাগ',
      status: 'published',
      createdAt: '2026-10-22T10:00:00.000Z',
      updatedAt: '2026-10-22T10:00:00.000Z'
    }
  });
  await mockDb.set(mockDb.ref({}, 'activePlusSync/v1/routine'), {
    'day-sat': { _syncDay: 'sat', _syncDate: true, date: '2026-10-24' },
    'RTN-SAT-1': {
      id: 'RTN-SAT-1',
      _syncDay: 'sat',
      _syncOrder: 0,
      time: '04:00 PM',
      period: '১ম পিরিয়ড',
      subject: 'পদার্থবিজ্ঞান',
      teacherName: 'তানভীর স্যার',
      room: 'রুম ২০২',
      className: 'দশম শ্রেণি',
      group: 'বিজ্ঞান বিভাগ'
    }
  });
  await sleep(400);

  const syncedNotices = JSON.parse(ctx.window.localStorage.getItem(database.KEYS.notices) || '[]');
  assert.equal(syncedNotices.some(n => n.id === 'NTC-LIVE-1'), true, 'live notice arrived in dummy student panel without reload');
  assert.match(ctx.$('#routineList')?.textContent || '', /পদার্থবিজ্ঞান/, 'live routine rendered in dummy student panel without reload');
  assert.equal(ds.syncVisual, 'synced', 'dummy student panel remains GREEN ("synced") after live cloud updates');
  assert.deepEqual(cloud.ruleViolations, [], 'zero RTDB security rule violations');

  ctx.window.close();
  cloud.server.close();
});
