/* Active Plus Coaching — Supabase PostgreSQL + Realtime Dual-Cloud Sync Engine.
 *
 * Runs alongside Firebase Realtime Database (`js/realtime-sync.js`) so every
 * collection, staff credential hash, student login hash, registration, exam,
 * and encrypted class-chat envelope stays mirrored across BOTH Firebase and
 * Supabase with durable per-record outboxes and zero plaintext credentials.
 */
import { LEGACY_CLOUD_ENABLED, assertCloudAccess, cloudPausedResult } from '../sync/cloud-access.js';
import { getSupabaseClient } from '../sync/supabase-client.js';
import { isSupabaseRuntimeEnabled } from '../sync/supabase-config.js';
import { SYNCABLE, KEYS } from './database.js';
import { STAFF_ACCOUNTS } from './staff-auth.js';
import { collectionPayload, remoteToLocal } from './sync-collections.js';
import { createRecordSync } from './record-sync.js';
import {
  chooseStaffCopy,
  chooseStudentCopy,
  sameStudentRecord,
  loginIdOf,
  matchesLoginIdentifier,
  findLoginMatches,
  suggestIdentifiers,
  recordTime
} from './sync-merge.js';
import { isPasswordRecord, verifyPassword } from './password-hash.js';
import { normalizeUsername, contactNumber, normalizeEmail } from './account-policy.js';
import { dhakaYYMMDD, DAILY_LIMIT_ERROR } from './idGenerator.js';
import { TEACHER_ASSIGNMENTS_KEY } from './teacher-assignments.js';
import { STAFF_DIRECTORY_KEY } from './staff-directory.js';
import { encodeUsernameKey } from './username-sync-codec.js';
import { isEncryptedEnvelope, decryptValue, encryptValue } from './secure-store.js';
import { CLASS_CHAT_RELAY_STATE_KEY } from './class-chat-relay.js';

const SUPABASE_COLLECTIONS = Object.freeze([
  ...SYNCABLE.filter(name => name !== 'exams' && name !== 'classChat'),
  'questionBank',
  'teacherAssignments'
]);

const DIRECTORY_BASELINE_KEY = 'activePlus.supabaseDirectoryBaseline.v1';
const SUPABASE_CHAT_RELAY_STATE_KEY = 'activePlus.supabaseClassChatRelay.v1';
const EXAM_SPACES = ['exams', 'attempts'];

const initialRawSetItem = globalThis.Storage?.prototype?.setItem || null;
function writeRawLocal(key, value) {
  const fn = initialRawSetItem || globalThis.Storage?.prototype?.setItem;
  if (fn && globalThis.localStorage) {
    fn.call(globalThis.localStorage, key, value);
    return;
  }
  globalThis.localStorage?.setItem(key, value);
}
const recordBridges = new Map();
const lastRemote = new Map();
const pullTimers = new Map();

let syncEnabled = false;
let syncGeneration = 0;
let started = false;
let ready = false;
let booting = null;
let realtimeChannel = null;
let pendingTimer = null;
let classChatQueue = Promise.resolve();
let classChatRelayPromise = null;

const examState = {
  lastRemote: { exams: new Map(), attempts: new Map() },
  lastLocal: { exams: new Map(), attempts: new Map() },
  pending: new Set(),
  orphans: new Map()
};

function setSupabaseDataset(status) {
  try {
    if (globalThis.document?.documentElement?.dataset) {
      globalThis.document.documentElement.dataset.supabaseConnection = status;
    }
  } catch { /* ignore headless environments */ }
}

function localKey(collection) {
  return collection === 'teacherAssignments' ? TEACHER_ASSIGNMENTS_KEY : KEYS[collection];
}

function readLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch { return null; }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function notifySupabaseRemote(key, collection) {
  try {
    const event = new window.StorageEvent('storage', {
      key,
      newValue: localStorage.getItem(key),
      storageArea: localStorage,
      url: location.href
    });
    Object.defineProperty(event, 'apcRemote', { value: true });
    Object.defineProperty(event, 'apcSupabaseRemote', { value: true });
    window.dispatchEvent(event);
  } catch {
    try {
      const fallback = new Event('storage');
      Object.defineProperties(fallback, {
        key: { value: key },
        newValue: { value: localStorage.getItem(key) },
        apcRemote: { value: true },
        apcSupabaseRemote: { value: true }
      });
      window.dispatchEvent(fallback);
    } catch { /* apc-sync-updated below always notifies */ }
  }
  window.dispatchEvent(new CustomEvent('apc-sync-updated', {
    detail: { collection, key, source: 'supabase' }
  }));
}

function remoteWriteSupabase(key, value, collection) {
  const serialized = JSON.stringify(value);
  if (localStorage.getItem(key) === serialized) return false;
  writeRawLocal(key, serialized);
  notifySupabaseRemote(key, collection);
  return true;
}

function staffRoleByAccountKey(key) {
  return Object.keys(STAFF_ACCOUNTS).find(role => STAFF_ACCOUNTS[role].accountKey === key) || null;
}

function studentAccountPayload(account) {
  if (!account || typeof account !== 'object') return null;
  const safe = { ...account };
  delete safe.pin;
  delete safe.securityAnswer;
  return safe;
}

function studentKey(account) {
  return normalizeUsername(account?.username || account?.student?.username || '') ||
    contactNumber(account?.registrationMobile || account?.mobile || '');
}

const isStudentAccountRecord = value =>
  Boolean(value) && typeof value === 'object' && isPasswordRecord(value.pinHash);

const isAdminRecord = value =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
  (typeof value.username === 'string' || Boolean(value.password));

function hasReviewerLocalSession() {
  for (const role of ['admin', 'manager']) {
    const spec = STAFF_ACCOUNTS[role];
    if (!spec) continue;
    try {
      if (window.sessionStorage?.getItem(spec.sessionKey) || window.localStorage?.getItem(spec.sessionKey)) {
        return true;
      }
    } catch { /* ignore blocked storage */ }
  }
  return false;
}

async function fetchCollectionMap(client, collection) {
  const { data, error } = await client
    .from('apc_records')
    .select('record_id, payload')
    .eq('collection', collection);
  if (error) throw error;
  const map = {};
  for (const row of data || []) {
    if (row && typeof row.record_id === 'string' && row.record_id) {
      map[row.record_id] = row.payload;
    }
  }
  return map;
}

function normalizeRemoteCollection(collection, rawMap) {
  return collectionPayload(collection, remoteToLocal(collection, rawMap || {})) || {};
}

function recordBridge(collection) {
  if (recordBridges.has(collection)) return recordBridges.get(collection);
  const key = localKey(collection);
  const stateKey = 'activePlus.supabaseOutbox.v1:' + collection;
  const bridge = createRecordSync({
    loadState: () => readLocal(stateKey),
    saveState: value => writeRawLocal(stateKey, JSON.stringify(value)),
    readLocal: () => collectionPayload(collection, readLocal(key)),
    writeLocal: value => remoteWriteSupabase(key, remoteToLocal(collection, value), collection),
    commit: async operations => {
      if (!syncEnabled) throw new Error('session-ended');
      const client = getSupabaseClient();
      if (!client) throw new Error('supabase-unavailable');
      const { data, error } = await client.rpc('apc_merge_collection_ops', {
        p_collection: collection,
        p_ops: operations
      });
      if (error) throw error;
      return normalizeRemoteCollection(collection, data || {});
    }
  });
  recordBridges.set(collection, bridge);
  return bridge;
}

async function syncCollectionSupabase(collection) {
  const generation = syncGeneration;
  if (!syncEnabled) return;
  const client = getSupabaseClient();
  if (!client) return;
  const bridge = recordBridge(collection);
  const remoteMap = await fetchCollectionMap(client, collection);
  if (!syncEnabled || generation !== syncGeneration) return;
  const hasRows = Object.keys(remoteMap).length > 0;
  if (!hasRows) {
    bridge.capture();
    if (bridge.hasView()) bridge.receive({});
    await bridge.flush();
    return;
  }
  bridge.receive(normalizeRemoteCollection(collection, remoteMap));
  await bridge.flush();
}

async function pushCollectionSupabase(collection) {
  const bridge = recordBridge(collection);
  bridge.capture();
  if (!ready || !navigator.onLine) return;
  await bridge.flush();
}

function schedulePull(label, fn, delayMs = 180) {
  const prev = pullTimers.get(label);
  if (prev) clearTimeout(prev);
  pullTimers.set(label, setTimeout(() => {
    pullTimers.delete(label);
    if (!syncEnabled || !navigator.onLine) return;
    Promise.resolve().then(fn).catch(err => {
      console.warn(`[Active Plus] Supabase live pull (${label}) deferred:`, err?.message || err);
    });
  }, delayMs));
}

/* ---- Exam DB (exams + attempts) ---------------------------------------- */
const examItemValid = item =>
  isPlainObject(item) && typeof item.id === 'string' && item.id &&
  typeof item.teacherId === 'string' && Array.isArray(item.participants) &&
  ['draft', 'pending', 'rejected', 'published'].includes(item.status);

const attemptItemValid = item =>
  isPlainObject(item) && typeof item.id === 'string' && item.id &&
  typeof item.examId === 'string' && typeof item.studentId === 'string' &&
  ['active', 'queued', 'submitted'].includes(item.status) &&
  (item.number === 1 || item.number === 2) && isPlainObject(item.answers) &&
  Array.isArray(item.order) && Number.isFinite(item.startedAt);

function readExamDbLocal() {
  let raw = null;
  try { raw = localStorage.getItem(KEYS.exams); } catch {}
  if (raw === null) return { db: { version: 1, exams: [], attempts: [] }, readable: true };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.version === 1 &&
        Array.isArray(parsed.exams) && Array.isArray(parsed.attempts)) {
      return { db: parsed, readable: true };
    }
  } catch {}
  return { db: { version: 1, exams: [], attempts: [] }, readable: false };
}

function markLocalExamChanges() {
  const { db, readable } = readExamDbLocal();
  if (!readable) return;
  for (const space of EXAM_SPACES) {
    const seen = new Set();
    for (const item of db[space]) {
      seen.add(item.id);
      if (examState.lastLocal[space].get(item.id) !== stableStringify(item)) {
        examState.pending.add(`${space}/${item.id}`);
      }
    }
    for (const id of examState.lastLocal[space].keys()) {
      if (!seen.has(id)) examState.pending.add(`${space}/${id}`);
    }
  }
}

async function pushExamDbSupabase() {
  if (!syncEnabled) return;
  const client = getSupabaseClient();
  if (!client) return;
  const { db, readable } = readExamDbLocal();
  if (!readable) return;

  const upserts = [];
  const deletesBySpace = { exams: [], attempts: [] };

  for (const space of EXAM_SPACES) {
    const valid = space === 'exams' ? examItemValid : attemptItemValid;
    const localIds = new Set();
    for (const item of db[space]) {
      if (!valid(item)) continue;
      localIds.add(item.id);
      const json = stableStringify(item);
      const key = `${space}/${item.id}`;
      if (examState.lastRemote[space].get(item.id) === json) {
        examState.lastLocal[space].set(item.id, json);
        examState.pending.delete(key);
        continue;
      }
      upserts.push({ space, item_id: item.id, payload: item, json, key });
    }
    for (const id of [...examState.lastRemote[space].keys()]) {
      if (!localIds.has(id)) deletesBySpace[space].push(id);
    }
  }

  if (upserts.length) {
    const rows = upserts.map(({ space, item_id, payload }) => ({
      space,
      item_id,
      payload,
      updated_at: new Date().toISOString()
    }));
    const { error } = await client.from('apc_exam_db').upsert(rows, { onConflict: 'space,item_id' });
    if (error) throw error;
    for (const entry of upserts) {
      examState.lastRemote[entry.space].set(entry.item_id, entry.json);
      examState.lastLocal[entry.space].set(entry.item_id, entry.json);
      examState.pending.delete(entry.key);
    }
  }

  for (const space of EXAM_SPACES) {
    const ids = deletesBySpace[space];
    if (!ids.length) continue;
    const { error } = await client.from('apc_exam_db').delete().eq('space', space).in('item_id', ids);
    if (error) throw error;
    for (const id of ids) {
      examState.lastRemote[space].delete(id);
      examState.lastLocal[space].delete(id);
      examState.pending.delete(`${space}/${id}`);
    }
  }
}

function applyExamDbRemoteRows(rows) {
  const remoteExams = {};
  const remoteAttempts = {};
  for (const row of rows || []) {
    if (!row || !row.item_id || !isPlainObject(row.payload)) continue;
    if (row.space === 'exams') remoteExams[row.item_id] = row.payload;
    else if (row.space === 'attempts') remoteAttempts[row.item_id] = row.payload;
  }

  const { db } = readExamDbLocal();
  let changed = false;

  const upsert = (space, item) => {
    const remoteJson = stableStringify(item);
    const key = `${space}/${item.id}`;
    if (examState.pending.has(key)) return;
    const items = db[space];
    const index = items.findIndex(entry => entry.id === item.id);
    if (index === -1) {
      items.push(item);
      examState.lastLocal[space].set(item.id, remoteJson);
      changed = true;
    } else if (stableStringify(items[index]) !== remoteJson) {
      items[index] = item;
      examState.lastLocal[space].set(item.id, remoteJson);
      changed = true;
    }
  };

  const remoteExamIds = new Set();
  for (const raw of Object.values(remoteExams)) {
    const item = { ...raw, participants: Array.isArray(raw.participants) ? raw.participants : [] };
    if (!examItemValid(item)) continue;
    remoteExamIds.add(item.id);
    examState.lastRemote.exams.set(item.id, stableStringify(item));
    upsert('exams', item);
  }
  for (let i = db.exams.length - 1; i >= 0; i -= 1) {
    const id = db.exams[i].id;
    if (remoteExamIds.has(id) || examState.pending.has(`exams/${id}`)) continue;
    if (!examState.lastRemote.exams.has(id)) continue;
    db.exams.splice(i, 1);
    examState.lastRemote.exams.delete(id);
    examState.lastLocal.exams.delete(id);
    changed = true;
  }

  const liveExamIds = new Set(db.exams.map(item => item.id));
  const remoteAttemptIds = new Set();
  for (const raw of Object.values(remoteAttempts)) {
    const item = {
      ...raw,
      answers: isPlainObject(raw.answers) ? raw.answers : {},
      order: Array.isArray(raw.order) ? raw.order : []
    };
    if (!attemptItemValid(item)) continue;
    remoteAttemptIds.add(item.id);
    examState.lastRemote.attempts.set(item.id, stableStringify(item));
    if (!liveExamIds.has(item.examId)) { examState.orphans.set(item.id, item); continue; }
    examState.orphans.delete(item.id);
    upsert('attempts', item);
  }
  for (const [id, item] of [...examState.orphans]) {
    if (!liveExamIds.has(item.examId)) continue;
    examState.orphans.delete(id);
    upsert('attempts', item);
  }
  for (let i = db.attempts.length - 1; i >= 0; i -= 1) {
    const attempt = db.attempts[i];
    if (examState.pending.has(`attempts/${attempt.id}`)) continue;
    const examGone = !liveExamIds.has(attempt.examId);
    const deletedRemotely = !remoteAttemptIds.has(attempt.id) && examState.lastRemote.attempts.has(attempt.id);
    if (!examGone && !deletedRemotely) continue;
    db.attempts.splice(i, 1);
    examState.lastRemote.attempts.delete(attempt.id);
    examState.lastLocal.attempts.delete(attempt.id);
    changed = true;
  }

  if (!changed) return false;
  const wrote = remoteWriteSupabase(KEYS.exams, db, 'exams');
  if (wrote) window.dispatchEvent(new Event('exam-data-updated'));
  return wrote;
}

async function syncExamDbSupabase() {
  const generation = syncGeneration;
  if (!syncEnabled) return;
  const client = getSupabaseClient();
  if (!client) return;
  const { data, error } = await client.from('apc_exam_db').select('space, item_id, payload');
  if (error) throw error;
  if (!syncEnabled || generation !== syncGeneration) return;
  if (!data || !data.length) {
    await pushExamDbSupabase();
    return;
  }
  applyExamDbRemoteRows(data);
  await pushExamDbSupabase();
}

/* ---- E2EE Class Chat Relay (7-Day Ephemeral Store-and-Forward) --------- */
function loadClassChatRelay() {
  classChatRelayPromise ??= import('./class-chat-relay.js').catch(error => {
    classChatRelayPromise = null;
    throw error;
  });
  return classChatRelayPromise;
}

function createSupabaseRelayStorageProxy() {
  return {
    getItem(key) {
      return localStorage.getItem(key === CLASS_CHAT_RELAY_STATE_KEY ? SUPABASE_CHAT_RELAY_STATE_KEY : key);
    },
    setItem(key, value) {
      writeRawLocal(key === CLASS_CHAT_RELAY_STATE_KEY ? SUPABASE_CHAT_RELAY_STATE_KEY : key, value);
    },
    removeItem(key) {
      localStorage.removeItem(key === CLASS_CHAT_RELAY_STATE_KEY ? SUPABASE_CHAT_RELAY_STATE_KEY : key);
    }
  };
}

function syncClassChatSupabase() {
  const generation = syncGeneration;
  const live = () => syncEnabled && generation === syncGeneration;
  if (!live()) return Promise.resolve();
  const work = classChatQueue.catch(() => {}).then(async () => {
    if (!live()) return;
    const client = getSupabaseClient();
    if (!client) return;
    const { syncClassChatRelayCycle } = await loadClassChatRelay();
    if (!live()) return;
    const proxyStorage = createSupabaseRelayStorageProxy();
    const readSnapshot = async () => {
      const map = await fetchCollectionMap(client, 'classChat');
      if (!live()) throw new Error('session-ended');
      return Object.keys(map).length ? map : null;
    };
    await syncClassChatRelayCycle({
      storage: proxyStorage,
      rawSetItem: (target, key, val) => {
        const mapped = key === CLASS_CHAT_RELAY_STATE_KEY ? SUPABASE_CHAT_RELAY_STATE_KEY : key;
        writeRawLocal(mapped, val);
      },
      notifyLocalUpdate: () => notifySupabaseRemote(KEYS.classChat, 'classChat'),
      readCloudSnapshot: readSnapshot,
      runCloudTransaction: async updater => {
        if (!live()) throw new Error('session-ended');
        const current = await readSnapshot();
        const next = updater(current);
        const curObj = current && typeof current === 'object' ? current : {};
        const nextObj = next && typeof next === 'object' ? next : {};
        const ops = {};
        for (const [id, val] of Object.entries(nextObj)) {
          if (stableStringify(curObj[id]) !== stableStringify(val)) {
            ops[id] = { value: val };
          }
        }
        for (const id of Object.keys(curObj)) {
          if (!Object.hasOwn(nextObj, id)) ops[id] = { value: null };
        }
        if (!Object.keys(ops).length) return next;
        const { data, error } = await client.rpc('apc_merge_collection_ops', {
          p_collection: 'classChat',
          p_ops: ops
        });
        if (error) throw error;
        return data && Object.keys(data).length ? data : null;
      }
    });
  });
  classChatQueue = work;
  return work;
}

/* ---- Staff Accounts, Staff Directory, Usernames & Student Accounts ----- */
async function readStaffLocal(role) {
  const spec = STAFF_ACCOUNTS[role];
  if (!spec) return null;
  try {
    const raw = localStorage.getItem(spec.accountKey);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (isEncryptedEnvelope(parsed)) {
      const plaintext = await decryptValue(parsed);
      if (!plaintext) return null;
      return JSON.parse(plaintext);
    }
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

async function writeStaffLocal(role, account) {
  const spec = STAFF_ACCOUNTS[role];
  if (!spec || !account || typeof account !== 'object') return false;
  return remoteWriteSupabase(spec.accountKey, account, 'staffAccounts');
}

async function syncStaffRoleSupabase(role) {
  const generation = syncGeneration;
  const live = () => syncEnabled && generation === syncGeneration;
  if (!live()) return;
  const client = getSupabaseClient();
  if (!client) return;

  const local = await readStaffLocal(role);
  if (!live()) return;
  const { data, error } = await client
    .from('apc_staff_accounts')
    .select('payload')
    .eq('role', role)
    .maybeSingle();
  if (error) throw error;
  if (!live()) return;

  const remote = data?.payload || null;
  const decision = chooseStaffCopy(local, remote, { role });
  if (decision === 'conflict' || decision === 'remote') {
    if (remote) {
      await writeStaffLocal(role, remote);
      lastRemote.set('staff:' + role, JSON.stringify(remote));
    }
    return;
  }
  if (!local || typeof local.username !== 'string' || !local.username || !isPasswordRecord(local.password)) {
    return;
  }
  const { error: upsertErr } = await client.from('apc_staff_accounts').upsert({
    role,
    username: local.username,
    payload: local,
    updated_at: new Date().toISOString()
  }, { onConflict: 'role' });
  if (upsertErr) throw upsertErr;
  lastRemote.set('staff:' + role, JSON.stringify(local));
  if (role === 'admin') {
    await client.from('apc_system').upsert({
      key: 'adminInitialized',
      value: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
  }
}

async function readDirectoryLocal() {
  try {
    const raw = readLocal(STAFF_DIRECTORY_KEY);
    if (raw === null) return null;
    if (isEncryptedEnvelope(raw)) {
      const plaintext = await decryptValue(raw);
      if (!plaintext) return null;
      return JSON.parse(plaintext);
    }
    return raw && typeof raw === 'object' ? raw : null;
  } catch { return null; }
}

async function syncDirectorySupabase({ readOnly = false } = {}) {
  const generation = syncGeneration;
  const live = () => readOnly || (syncEnabled && generation === syncGeneration);
  if (!live()) return;
  const client = getSupabaseClient();
  if (!client) return;

  const beforeRaw = localStorage.getItem(STAFF_DIRECTORY_KEY);
  const local = await readDirectoryLocal();
  if (!live()) return;
  const baseline = readLocal(DIRECTORY_BASELINE_KEY);
  const records = Object.fromEntries((local?.records || []).map(r => [r.id, r]));
  const operations = {};
  for (const [id, record] of Object.entries(records)) {
    if (baseline && baseline[id] === record.updatedAt) continue;
    operations[id] = { value: record, ...(!baseline ? { seed: true } : {}) };
  }
  if (local && baseline) {
    for (const id of Object.keys(baseline)) {
      if (!Object.hasOwn(records, id)) operations[id] = { value: null };
    }
  }

  let remoteRecords = [];
  if (!readOnly && Object.keys(operations).length) {
    const { data, error } = await client.rpc('apc_merge_staff_directory', { p_ops: operations });
    if (error) throw error;
    remoteRecords = Array.isArray(data?.records) ? data.records : [];
  } else {
    const { data, error } = await client.from('apc_staff_directory').select('payload').order('staff_id');
    if (error) throw error;
    remoteRecords = (data || []).map(row => row.payload).filter(Boolean);
  }
  if (!live()) return;
  if (!remoteRecords.length && !baseline) return;

  const remoteDoc = {
    version: 1,
    records: remoteRecords,
    updatedAt: local?.updatedAt || new Date().toISOString()
  };
  const envelope = await encryptValue(JSON.stringify(remoteDoc));
  if (!live() || localStorage.getItem(STAFF_DIRECTORY_KEY) !== beforeRaw) return;
  writeRawLocal(DIRECTORY_BASELINE_KEY, JSON.stringify(
    Object.fromEntries(remoteRecords.map(r => [r.id, r.updatedAt || '']))
  ));
  lastRemote.set('staffDirectory', JSON.stringify(remoteDoc));
  remoteWriteSupabase(STAFF_DIRECTORY_KEY, envelope || remoteDoc, 'staffDirectory');
}

async function syncUsernamesSupabase() {
  const generation = syncGeneration;
  if (!syncEnabled) return;
  const client = getSupabaseClient();
  if (!client) return;

  const local = readLocal(KEYS.usernames);
  const localMap = local && typeof local === 'object' && !Array.isArray(local) ? local : {};
  const { data, error } = await client.from('apc_usernames').select('username, claim');
  if (error) throw error;
  if (!syncEnabled || generation !== syncGeneration) return;

  const remoteMap = {};
  for (const row of data || []) {
    if (row?.username) remoteMap[row.username] = row.claim;
  }

  const missingUpserts = [];
  for (const [uname, claim] of Object.entries(localMap)) {
    const clean = normalizeUsername(uname);
    if (!clean || Object.hasOwn(remoteMap, clean)) continue;
    missingUpserts.push({
      username: clean,
      claim: typeof claim === 'object' && claim !== null ? claim : { owner: claim },
      updated_at: new Date().toISOString()
    });
  }
  if (missingUpserts.length) {
    await client.from('apc_usernames').upsert(missingUpserts, { onConflict: 'username', ignoreDuplicates: true });
  }

  const merged = { ...localMap };
  for (const [uname, claim] of Object.entries(remoteMap)) {
    merged[uname] = claim?.studentId || claim?.owner || claim;
  }
  if (Object.keys(merged).length) {
    remoteWriteSupabase(KEYS.usernames, merged, 'usernames');
  }
}

async function syncStudentAccountSupabase() {
  const generation = syncGeneration;
  if (!syncEnabled) return;
  const client = getSupabaseClient();
  if (!client) return;

  const local = studentAccountPayload(readLocal(KEYS.account));
  const key = studentKey(local);
  if (!key || !isPasswordRecord(local?.pinHash)) return;

  const encodedKey = encodeUsernameKey(key);
  const { data, error } = await client.rpc('apc_upsert_student_account', {
    p_login_key: encodedKey,
    p_record: local
  });
  if (error) throw error;
  if (!syncEnabled || generation !== syncGeneration) return;

  const remote = data?.record;
  if (!data?.conflict && isStudentAccountRecord(remote) && studentKey(remote) === key) {
    const current = studentAccountPayload(readLocal(KEYS.account));
    if (sameStudentRecord(current, remote) && recordTime(remote) > recordTime(current)) {
      remoteWriteSupabase(KEYS.account, remote, 'studentAccount');
    }
  }
}

async function pullStudentAccountSupabase() {
  if (!syncEnabled) return;
  const client = getSupabaseClient();
  if (!client) return;
  const local = readLocal(KEYS.account);
  const key = studentKey(local);
  if (!key) return;
  const { data, error } = await client
    .from('apc_student_accounts')
    .select('payload')
    .eq('login_key', encodeUsernameKey(key))
    .maybeSingle();
  if (error || !data?.payload) return;
  const remote = data.payload;
  if (isStudentAccountRecord(remote) && sameStudentRecord(local, remote) && recordTime(remote) > recordTime(local)) {
    remoteWriteSupabase(KEYS.account, remote, 'studentAccount');
  }
}

function mergeNotificationLists(localItems, remoteRows) {
  const byId = new Map();
  for (const item of Array.isArray(localItems) ? localItems : []) {
    if (item && typeof item === 'object' && item.id && item.studentId) {
      byId.set(item.id, { ...item });
    }
  }
  for (const row of remoteRows || []) {
    const remote = row?.payload;
    if (!remote || typeof remote !== 'object' || !remote.studentId) continue;
    const id = String(remote.id || row.notification_id);
    const prev = byId.get(id);
    const read = Boolean(prev?.read || remote.read || row.is_read);
    byId.set(id, {
      ...(prev || {}),
      ...remote,
      id,
      read,
      ...(prev?.readAt && !remote.readAt ? { readAt: prev.readAt } : {}),
      ...(prev?.readBy && !remote.readBy ? { readBy: prev.readBy } : {})
    });
  }
  return [...byId.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function syncNotificationsSupabase() {
  if (!syncEnabled || !hasReviewerLocalSession()) return;
  const generation = syncGeneration;
  const client = getSupabaseClient();
  if (!client) return;

  const { data, error } = await client
    .from('apc_notifications')
    .select('notification_id, student_id, is_read, payload');
  if (error) throw error;
  if (!syncEnabled || generation !== syncGeneration) return;

  const remoteById = new Map((data || []).map(row => [row.notification_id, row]));
  const local = readLocal(KEYS.registrationNotifications) || [];
  const merged = mergeNotificationLists(local, data || []);
  remoteWriteSupabase(KEYS.registrationNotifications, merged, 'registrationNotifications');

  const upserts = [];
  for (const item of merged) {
    const existing = remoteById.get(item.id);
    if (!existing || (item.read && !existing.is_read)) {
      upserts.push({
        notification_id: item.id,
        student_id: item.studentId || null,
        is_read: Boolean(item.read),
        payload: item,
        created_at_iso: item.createdAt || null,
        updated_at: new Date().toISOString()
      });
    }
  }
  if (upserts.length) {
    await client.from('apc_notifications').upsert(upserts, { onConflict: 'notification_id' });
  }
}

/* ---- Local Write & Cross-Cloud Replication Bridge ---------------------- */
function installSupabaseWriteBridge() {
  if (!globalThis.window || window.__apcSupabaseSyncBridge || !globalThis.Storage?.prototype) return;

  const routeKeyChange = key => {
    const staffRole = staffRoleByAccountKey(key);
    if (staffRole) {
      syncStaffRoleSupabase(staffRole).catch(() => {});
    }
    for (const collection of SUPABASE_COLLECTIONS) {
      if (localKey(collection) === key) {
        pushCollectionSupabase(collection).catch(() => {});
      }
    }
    if (key === STAFF_DIRECTORY_KEY) syncDirectorySupabase().catch(() => {});
    if (key === KEYS.usernames) syncUsernamesSupabase().catch(() => {});
    if (key === KEYS.account) syncStudentAccountSupabase().catch(() => {});
    if (key === KEYS.exams) {
      markLocalExamChanges();
      if (ready && navigator.onLine) pushExamDbSupabase().catch(() => {});
    }
    if (key === KEYS.classChat) {
      if (ready && navigator.onLine) syncClassChatSupabase().catch(() => {});
    }
  };

  const previousSetItem = globalThis.Storage.prototype.setItem;
  globalThis.Storage.prototype.setItem = function setItemWithSupabaseBridge(key, value) {
    const result = previousSetItem.call(this, key, value);
    if (syncEnabled && this === window.localStorage) {
      routeKeyChange(key);
    }
    return result;
  };

  window.addEventListener('storage', event => {
    if (!syncEnabled || event.apcSupabaseRemote || event.storageArea !== window.localStorage) return;
    if (event.key) routeKeyChange(event.key);
  });

  // When Firebase applies an incoming remote change via rawSetItem, replicate
  // any unseen delta into Supabase automatically so both clouds stay identical.
  window.addEventListener('apc-sync-updated', event => {
    if (!syncEnabled || event.detail?.source === 'supabase') return;
    const key = event.detail?.key;
    if (key) routeKeyChange(key);
  });

  window.__apcSupabaseSyncBridge = true;
}

/* ---- Realtime WebSocket Subscriptions ---------------------------------- */
function subscribeRealtimeChanges(client) {
  if (realtimeChannel) {
    try { client.removeChannel(realtimeChannel); } catch {}
    realtimeChannel = null;
  }
  if (typeof client.channel !== 'function') return;

  const channel = client.channel('apc-supabase-realtime-v1');
  channel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'apc_records' }, payload => {
      const col = payload?.new?.collection || payload?.old?.collection;
      if (!col) return;
      if (col === 'classChat') schedulePull('classChat', () => syncClassChatSupabase());
      else if (SUPABASE_COLLECTIONS.includes(col)) schedulePull('col:' + col, () => syncCollectionSupabase(col));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'apc_exam_db' }, () => {
      schedulePull('exams', () => syncExamDbSupabase());
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'apc_staff_accounts' }, payload => {
      const role = payload?.new?.role || payload?.old?.role;
      if (role && STAFF_ACCOUNTS[role]) schedulePull('staff:' + role, () => syncStaffRoleSupabase(role));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'apc_staff_directory' }, () => {
      schedulePull('directory', () => syncDirectorySupabase());
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'apc_student_accounts' }, () => {
      schedulePull('studentAcc', () => pullStudentAccountSupabase());
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'apc_usernames' }, () => {
      schedulePull('usernames', () => syncUsernamesSupabase());
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'apc_notifications' }, () => {
      schedulePull('notifications', () => syncNotificationsSupabase());
    })
    .subscribe(status => {
      if (!syncEnabled) return;
      if (status === 'SUBSCRIBED') setSupabaseDataset('connected');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSupabaseDataset('degraded');
    });

  realtimeChannel = channel;
}

function hasPendingOutbox() {
  return [...recordBridges.values()].some(b => b.hasPending()) || examState.pending.size > 0;
}

async function flushPendingSupabase() {
  if (!syncEnabled) return;
  await Promise.all([
    ...[...recordBridges.values()].map(b => b.flush()),
    pushExamDbSupabase(),
    syncClassChatSupabase()
  ]);
}

/* ---- Exported Dual-Cloud Lifecycle & Auth/Registration APIs ------------ */
export function stopSupabaseSync() {
  syncEnabled = false;
  syncGeneration += 1;
  booting = null;
  started = false;
  ready = false;
  for (const timer of pullTimers.values()) clearTimeout(timer);
  pullTimers.clear();
  window?.clearInterval?.(pendingTimer);
  pendingTimer = null;
  if (realtimeChannel) {
    try { getSupabaseClient()?.removeChannel?.(realtimeChannel); } catch {}
    realtimeChannel = null;
  }
  setSupabaseDataset('disconnected');
}

if (typeof window !== 'undefined') {
  window.addEventListener('apc-session-ended', stopSupabaseSync);
}

export async function startSupabaseSync() {
  if (!LEGACY_CLOUD_ENABLED) {
    stopSupabaseSync();
    return cloudPausedResult();
  }
  if (!isSupabaseRuntimeEnabled()) {
    setSupabaseDataset('disabled');
    return { ok: false, reason: 'supabase-disabled' };
  }
  const client = getSupabaseClient();
  if (!client) {
    setSupabaseDataset('disabled');
    return { ok: false, reason: 'supabase-unconfigured' };
  }

  const generation = syncGeneration;
  let session = false;
  try {
    const { hasSyncSession } = await import('./sync-session.js');
    session = await hasSyncSession();
  } catch { session = false; }

  if (!session || generation !== syncGeneration) {
    if (!session && generation === syncGeneration) stopSupabaseSync();
    return { ok: false, reason: 'authentication-required' };
  }

  syncEnabled = true;
  if (!navigator.onLine) {
    setSupabaseDataset('offline');
    return { ok: false, reason: 'offline' };
  }
  if (booting) return booting;
  if (started && ready) {
    try { await flushPendingSupabase(); } catch {}
    return { ok: true, mode: 'supabase-sync' };
  }

  const flight = (async () => {
    setSupabaseDataset('syncing');
    for (const collection of SUPABASE_COLLECTIONS) recordBridge(collection);
    installSupabaseWriteBridge();

    const tasks = [
      ...SUPABASE_COLLECTIONS.map(col => () => syncCollectionSupabase(col)),
      () => syncExamDbSupabase(),
      () => syncClassChatSupabase(),
      ...Object.keys(STAFF_ACCOUNTS).map(role => () => syncStaffRoleSupabase(role)),
      () => syncDirectorySupabase(),
      () => syncUsernamesSupabase(),
      () => syncStudentAccountSupabase(),
      () => syncNotificationsSupabase()
    ];

    const results = await Promise.allSettled(tasks.map(fn => fn()));
    if (!syncEnabled || generation !== syncGeneration) {
      return { ok: false, reason: 'session-ended' };
    }
    const rejected = results.filter(r => r.status === 'rejected');
    if (rejected.length === tasks.length) {
      started = false;
      ready = false;
      setSupabaseDataset('error');
      return { ok: false, reason: 'sync-failed', error: rejected[0].reason };
    }

    subscribeRealtimeChanges(client);
    ready = true;
    started = true;
    setSupabaseDataset('connected');

    window.clearInterval(pendingTimer);
    pendingTimer = window.setInterval(() => {
      if (!ready || !syncEnabled || !navigator.onLine) return;
      if (hasPendingOutbox()) flushPendingSupabase().catch(() => {});
    }, 4000);

    return { ok: true, mode: 'supabase-sync', partialErrors: rejected.length };
  })();

  booting = flight;
  try { return await flight; } finally { if (booting === flight) booting = null; }
}

export async function hydrateStaffAccountsSupabase({ preserveLocalAdmin = false } = {}) {
  if (!isSupabaseRuntimeEnabled() || !navigator.onLine) return { ok: false, reason: 'offline' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: 'supabase-unconfigured' };
  try {
    const { data, error } = await client.from('apc_staff_accounts').select('role, payload');
    if (error) throw error;
    for (const row of data || []) {
      const role = row?.role;
      const account = row?.payload;
      if (!STAFF_ACCOUNTS[role]) continue;
      if (role === 'admin' && preserveLocalAdmin && await readStaffLocal('admin')) continue;
      if (account?.username && isPasswordRecord(account.password)) {
        await writeStaffLocal(role, account);
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'staff-sync-failed', error };
  }
}

export async function adminInitializationStateSupabase() {
  if (!isSupabaseRuntimeEnabled() || !navigator.onLine) return { ok: false, reason: 'offline' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: 'supabase-unconfigured' };
  try {
    const [{ data: adminRow, error: adminErr }, { data: flagRow }] = await Promise.all([
      client.from('apc_staff_accounts').select('payload').eq('role', 'admin').maybeSingle(),
      client.from('apc_system').select('value').eq('key', 'adminInitialized').maybeSingle()
    ]);
    if (adminErr) throw adminErr;
    const recordExists = isAdminRecord(adminRow?.payload);
    const flag = flagRow?.value === true;
    return { ok: true, initialized: flag || recordExists, flag, recordExists };
  } catch (error) {
    return { ok: false, reason: 'admin-check-failed', error };
  }
}

export async function firstAdminExistsSupabase() {
  const state = await adminInitializationStateSupabase();
  return state.ok ? { ok: true, exists: state.initialized } : state;
}

export async function claimFirstAdminAccountSupabase(record) {
  if (!isSupabaseRuntimeEnabled() || !navigator.onLine) return { ok: false, reason: 'offline' };
  if (!isAdminRecord(record) || !isPasswordRecord(record?.password)) {
    return { ok: false, reason: 'invalid-record' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: 'supabase-unconfigured' };
  try {
    const { data, error } = await client.rpc('apc_claim_first_admin', { p_record: record });
    if (error) throw error;
    if (!data?.committed) return { ok: false, reason: 'admin-exists' };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'claim-failed', error };
  }
}

export async function usernameTakenSupabase(username) {
  const name = loginIdOf({ username });
  if (!name) return { ok: true, taken: false };
  if (!isSupabaseRuntimeEnabled() || !navigator.onLine) return { ok: false, taken: false, offline: true };
  const client = getSupabaseClient();
  if (!client) return { ok: false, taken: false };
  try {
    const encoded = encodeUsernameKey(name);
    const [claimRes, accRes, dirRes] = await Promise.all([
      client.from('apc_usernames').select('username').eq('username', name).maybeSingle(),
      client.from('apc_student_accounts').select('login_key').eq('login_key', encoded).maybeSingle(),
      client.from('apc_staff_directory').select('payload')
    ]);
    const staff = (dirRes.data || []).map(r => r.payload).filter(Boolean);
    const taken = Boolean(claimRes.data) || Boolean(accRes.data) ||
      staff.some(emp => loginIdOf(emp) === name);
    return { ok: true, taken };
  } catch (error) {
    return { ok: false, taken: false, error };
  }
}

async function hydrateStudentSupabase(client, identifier, password) {
  if (!identifier) return { found: false };
  const cleanUser = normalizeUsername(identifier);
  const cleanMobile = contactNumber(identifier);
  const rawTrim = String(identifier || '').trim();

  let account = null;
  if (cleanUser) {
    const { data } = await client
      .from('apc_student_accounts')
      .select('payload')
      .eq('login_key', encodeUsernameKey(cleanUser))
      .maybeSingle();
    if (data?.payload && matchesLoginIdentifier(data.payload, identifier)) {
      account = data.payload;
    }
  }

  let cloudAccounts = 0;
  let similar = [];
  if (!account) {
    let candidates = [];
    if (/^\d{9}$/.test(rawTrim)) {
      const { data } = await client.from('apc_student_accounts').select('payload').eq('student_id', rawTrim);
      candidates = (data || []).map(r => r.payload).filter(Boolean);
    } else if (cleanMobile) {
      const { data } = await client.from('apc_student_accounts').select('payload').eq('mobile', cleanMobile);
      candidates = (data || []).map(r => r.payload).filter(Boolean);
    }
    if (!candidates.length) {
      const { data } = await client.from('apc_student_accounts').select('payload');
      candidates = (data || []).map(r => r.payload).filter(Boolean);
    }
    cloudAccounts = candidates.length;
    const matches = findLoginMatches(candidates, identifier);
    if (matches.length > 1) return { found: true, ambiguous: true };
    account = matches[0] || null;
    if (!account) similar = suggestIdentifiers(candidates, identifier);
  }

  if (!account || !isPasswordRecord(account.pinHash)) {
    return { found: false, cloudAccounts, similar };
  }
  if (!(await verifyPassword(password, account.pinHash))) {
    return { found: true, credentialMismatch: true };
  }
  remoteWriteSupabase(KEYS.account, account, 'studentAccount');
  return { found: true };
}

export async function hydrateUserIdentifiersSupabase({ identifier = '', password = '' } = {}) {
  if (!isSupabaseRuntimeEnabled() || !navigator.onLine) return { ok: false, reason: 'offline' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: 'supabase-unconfigured' };
  try {
    const student = await hydrateStudentSupabase(client, identifier, password);
    if (student.found) return { ok: true, ...student };
    await syncDirectorySupabase({ readOnly: true });
    return { ok: true, ...student };
  } catch (error) {
    return { ok: false, reason: 'identity-sync-failed', error };
  }
}

export async function registerStudentAtomicallySupabase({
  mobile,
  username,
  email = '',
  preferredStudentId = '',
  buildRecords,
  prebuiltRecords = null
}) {
  assertCloudAccess();
  if (!isSupabaseRuntimeEnabled() || !navigator.onLine) {
    return { ok: false, reason: 'network-unavailable', offline: true };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: 'network-unavailable' };

  const cleanMobile = contactNumber(mobile);
  const cleanUsername = normalizeUsername(username);
  const cleanEmail = normalizeEmail(email);
  const preferredId = /^\d{9}$/.test(String(preferredStudentId || '').trim())
    ? String(preferredStudentId).trim()
    : '';
  const loginKey = encodeUsernameKey(cleanUsername || cleanMobile);
  const serverMs = Date.now();
  const datePrefix = dhakaYYMMDD(serverMs);

  try {
    const built = prebuiltRecords || await buildRecords({
      studentId: preferredId || `${datePrefix}001`,
      serverMs
    });
    const safeCloudAccount = studentAccountPayload(built.cloudAccount);

    const { data, error } = await client.rpc('apc_register_student_atomic', {
      p_yymmdd: datePrefix,
      p_preferred_id: preferredId || null,
      p_login_key: loginKey,
      p_username: cleanUsername || null,
      p_mobile: cleanMobile || null,
      p_email: cleanEmail || null,
      p_account: safeCloudAccount,
      p_student_row: built.studentRow,
      p_notification: built.notificationRecord || null
    });
    if (error) throw error;

    if (!data?.ok) {
      if (data?.reason === 'duplicate-username') {
        return {
          ok: false,
          reason: 'duplicate',
          field: 'username',
          error: 'এই ইউজারনেমটি আগেই নেওয়া হয়েছে। অন্য একটি বেছে নিন — এটি পরে বদলানো যাবে না।'
        };
      }
      if (data?.reason === 'duplicate-mobile') {
        return {
          ok: false,
          reason: 'duplicate',
          field: 'mobile',
          error: 'এই মোবাইল নম্বর দিয়ে আগেই রেজিস্ট্রেশন হয়েছে।'
        };
      }
      if (data?.reason === 'duplicate-email') {
        return {
          ok: false,
          reason: 'duplicate',
          field: 'email',
          error: 'এই ইমেইল ঠিকানা দিয়ে আগেই রেজিস্ট্রেশন হয়েছে।'
        };
      }
      if (data?.reason === 'daily-limit-reached') {
        return { ok: false, reason: 'daily-limit', field: 'id', error: DAILY_LIMIT_ERROR };
      }
      return { ok: false, reason: data?.reason || 'registration-failed' };
    }

    // If Supabase allocated a different final Student ID than the provisional
    // buildRecords preview, rebuild once with the authoritative ID and persist.
    const allocatedId = String(data.studentId || '').trim();
    if (!prebuiltRecords && buildRecords && allocatedId && allocatedId !== built.studentRow?.id) {
      const rebuilt = await buildRecords({ studentId: allocatedId, serverMs });
      const rebuiltAccount = studentAccountPayload(rebuilt.cloudAccount);
      await client.rpc('apc_register_student_atomic', {
        p_yymmdd: datePrefix,
        p_preferred_id: allocatedId,
        p_login_key: loginKey,
        p_username: cleanUsername || null,
        p_mobile: cleanMobile || null,
        p_email: cleanEmail || null,
        p_account: rebuiltAccount,
        p_student_row: rebuilt.studentRow,
        p_notification: rebuilt.notificationRecord || null
      });
      return {
        ok: true,
        studentId: allocatedId,
        serverMs,
        studentRow: rebuilt.studentRow,
        cloudAccount: rebuiltAccount,
        notificationRecord: rebuilt.notificationRecord
      };
    }

    return {
      ok: true,
      studentId: allocatedId,
      serverMs,
      studentRow: data.studentRow || built.studentRow,
      cloudAccount: data.accountRecord || safeCloudAccount,
      notificationRecord: built.notificationRecord
    };
  } catch (error) {
    return { ok: false, reason: 'network-unavailable', error };
  }
}

export async function syncRegistrationDecisionSupabase({
  studentId,
  studentRow,
  decision,
  approvedBy = '',
  approvedAt = '',
  reviewNote = ''
}) {
  if (!LEGACY_CLOUD_ENABLED || !isSupabaseRuntimeEnabled() || !navigator.onLine) {
    return { ok: false, reason: 'offline' };
  }
  if (!hasReviewerLocalSession()) return { ok: false, reason: 'not-allowed' };
  const sid = String(studentId || '').trim();
  if (!sid) return { ok: false, reason: 'missing-id' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: 'supabase-unconfigured' };

  try {
    const mappedAccountStatus = decision === 'approved' || decision === 'active' ? 'active' : 'rejected';
    const nowIso = approvedAt || new Date().toISOString();

    if (studentRow && typeof studentRow === 'object') {
      await client.rpc('apc_merge_collection_ops', {
        p_collection: 'students',
        p_ops: { [sid]: { value: { ...studentRow, id: sid } } }
      });
    }

    const { data: accRows } = await client
      .from('apc_student_accounts')
      .select('login_key, payload')
      .eq('student_id', sid);

    for (const row of accRows || []) {
      if (!isStudentAccountRecord(row.payload)) continue;
      const updated = {
        ...row.payload,
        status: mappedAccountStatus,
        ...(approvedBy ? { approvedBy } : {}),
        ...(approvedAt ? { approvedAt } : {}),
        ...(reviewNote ? { reviewNote } : {}),
        updatedAt: nowIso,
        student: {
          ...(row.payload.student || {}),
          status: decision === 'approved' || decision === 'active' ? 'approved' : 'rejected'
        }
      };
      await client.rpc('apc_upsert_student_account', {
        p_login_key: row.login_key,
        p_record: updated
      });
    }

    const { data: notifRows } = await client
      .from('apc_notifications')
      .select('notification_id, payload')
      .eq('student_id', sid);
    for (const nRow of notifRows || []) {
      const updatedNotif = {
        ...(nRow.payload || {}),
        read: true,
        readAt: nowIso,
        ...(approvedBy ? { readBy: approvedBy } : {})
      };
      await client.from('apc_notifications').upsert({
        notification_id: nRow.notification_id,
        student_id: sid,
        is_read: true,
        payload: updatedNotif,
        updated_at: nowIso
      }, { onConflict: 'notification_id' });
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'decision-sync-failed', error };
  }
}

export async function refreshStudentApprovalSupabase(account) {
  if (!LEGACY_CLOUD_ENABLED || !isSupabaseRuntimeEnabled() || !navigator.onLine || !account) {
    return { ok: false, reason: 'offline' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: 'supabase-unconfigured' };
  const sid = String(account.student?.id || account.studentId || '').trim();
  const uname = normalizeUsername(account.username || account.student?.username || '');
  try {
    const [rowRes, accRes] = await Promise.all([
      sid
        ? client.from('apc_records').select('payload').eq('collection', 'students').eq('record_id', sid).maybeSingle()
        : Promise.resolve({ data: null }),
      uname
        ? client.from('apc_student_accounts').select('payload').eq('login_key', encodeUsernameKey(uname)).maybeSingle()
        : Promise.resolve({ data: null })
    ]);
    const row = rowRes?.data?.payload || null;
    const remoteAcc = accRes?.data?.payload || null;
    const rowStatus = row?.status;
    const accStatus = remoteAcc?.status;

    if (rowStatus === 'approved' || rowStatus === 'active' || accStatus === 'active' || accStatus === 'approved') {
      return {
        ok: true,
        status: 'active',
        approvedBy: row?.approvedBy || remoteAcc?.approvedBy || row?.reviewedBy || '',
        approvedAt: row?.approvedAt || remoteAcc?.approvedAt || row?.reviewedAt || '',
        row
      };
    }
    if (rowStatus === 'rejected' || accStatus === 'rejected') {
      return {
        ok: true,
        status: 'rejected',
        reviewNote: row?.reviewNote || remoteAcc?.reviewNote || '',
        row
      };
    }
    if (rowStatus === 'inactive' || accStatus === 'inactive') {
      return { ok: true, status: 'inactive', row };
    }
    return { ok: true, status: account.status || 'pending', row };
  } catch (error) {
    return { ok: false, reason: 'refresh-failed', error };
  }
}

export async function pollRegistrationFeedSupabase() {
  if (!LEGACY_CLOUD_ENABLED || !isSupabaseRuntimeEnabled() || !navigator.onLine || !hasReviewerLocalSession()) {
    return { ok: false, reason: 'skipped' };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: 'skipped' };
  try {
    const studentsMap = await fetchCollectionMap(client, 'students');
    if (Object.keys(studentsMap).length) {
      const bridge = recordBridge('students');
      bridge.receive(normalizeRemoteCollection('students', studentsMap));
    }
    await syncNotificationsSupabase();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'poll-failed', error };
  }
}

export async function resetSupabaseDatabase() {
  if (!isSupabaseRuntimeEnabled() || !navigator.onLine) return { ok: false, reason: 'offline' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: 'supabase-unconfigured' };
  stopSupabaseSync();
  try {
    const { error } = await client.rpc('apc_reset_cloud_database');
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'reset-failed', error };
  }
}
