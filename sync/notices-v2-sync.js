/* Authenticated, role-scoped Notices realtime client for activePlusV2.
 * Wired into js/realtime-sync-entry.js alongside question-bank-v2-sync.js, and
 * claims-gated: it activates only for a signed-in user whose custom claims
 * authorize a Notices v2 path (sync/notices-v2-policy.js). Anonymous/claimless
 * sessions remain immediate no-ops while activePlusSync/v1 is active. */
import { firebaseApp, appCheckReady } from '../firebase/firebase-init.js';
import {
  getAuth, getDatabase, ref, get, set, runTransaction, onValue as firebaseOnValue
} from '../firebase/firebase-services.js';
import { callCloudFunction } from './cloud-auth.js';
import { noticeSyncPlan } from './notices-v2-policy.js';
import { KEYS, readJSON } from '../js/database.js';
import { withClassKey, normalizeClassId, normalizeSectionId } from '../js/class-key.js';
import { createRecordSync, mergeRecordOperations, stableJSON } from '../js/record-sync.js';
import { isRtdbKey, unsafeKeyPath } from '../js/rtdb-keys.js';

const ROOT = 'activePlusV2';
const OUTBOX_PREFIX = 'activePlus.v2NoticesOutbox.v1:';
const BASELINE_PREFIX = 'activePlus.v2NoticesBaseline.v1:';
const OWNED_PREFIX = 'activePlus.v2NoticesOwnedIds.v1:';
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const text = (value, max = 2000) => String(value ?? '').normalize('NFC').trim().slice(0, max);
const parseMap = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

let activeController = null;

function normalizeNoticeRow(raw, { forcePublished = null } = {}) {
  const stamped = withClassKey(raw || {});
  const id = text(stamped.id, 128);
  const status = forcePublished === true
    ? 'published'
    : forcePublished === false
      ? 'draft'
      : (stamped.status === 'draft' || stamped.published === false ? 'draft' : 'published');
  const published = status === 'published';
  const classId = text(stamped.classId || stamped.className, 80);
  const className = text(stamped.className || classId, 80);
  const group = text(stamped.group || stamped.sectionId, 80);
  return {
    ...copy(stamped),
    id,
    title: text(stamped.title, 200) || 'নোটিশ',
    body: text(stamped.body ?? stamped.summary, 4000),
    summary: text(stamped.summary ?? stamped.body, 500),
    category: text(stamped.category, 40) || 'academic',
    audience: text(stamped.audience, 80) || 'সকল শিক্ষার্থী',
    classId,
    className,
    group,
    date: text(stamped.date, 40),
    status,
    published,
    createdBy: text(stamped.createdBy, 100) || 'অফিস',
    createdAt: stamped.createdAt ?? new Date().toISOString(),
    updatedAt: stamped.updatedAt ?? stamped.createdAt ?? new Date().toISOString()
  };
}

function localNoticeMap({ publishedOnly = false } = {}) {
  const list = readJSON(KEYS.notices, []);
  if (!Array.isArray(list)) return {};
  const rows = {};
  for (const item of list) {
    if (!item || typeof item.id !== 'string' || !isRtdbKey(item.id) || unsafeKeyPath(item)) continue;
    const normalized = normalizeNoticeRow(item);
    if (publishedOnly && !normalized.published) continue;
    rows[normalized.id] = normalized;
  }
  return rows;
}

function writeLocalNoticeMap(map, { preserveUnpublished = false, source = 'v2-cloud' } = {}) {
  const existing = Array.isArray(readJSON(KEYS.notices, [])) ? readJSON(KEYS.notices, []) : [];
  const nextRows = Object.entries(map || {})
    .filter(([id, row]) => isRtdbKey(id) && row && row.id === id && !unsafeKeyPath(row))
    .map(([, row]) => normalizeNoticeRow(row));
  if (preserveUnpublished) {
    const seen = new Set(nextRows.map(row => row.id));
    for (const item of existing) {
      if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue;
      if (item.status === 'draft' || item.published === false) {
        nextRows.push(normalizeNoticeRow(item, { forcePublished: false }));
      }
    }
  }
  window.localStorage.setItem(KEYS.notices, JSON.stringify(nextRows));
  try {
    const storageEvent = new StorageEvent('storage', { key: KEYS.notices });
    storageEvent.apcRemote = true;
    window.dispatchEvent(storageEvent);
  } catch { /* non-DOM env fallback */ }
  window.dispatchEvent(new CustomEvent('apc-sync-updated', { detail: { collection: 'notices', source } }));
}

function setJSON(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readOutbox(key) {
  return parseMap(readJSON(key, {}));
}

function readOwnedIds(key) {
  const value = readJSON(key, []);
  return new Set(Array.isArray(value) ? value.filter(isRtdbKey) : []);
}

function publicNoticeProjection(snapshotValue) {
  const projection = {};
  for (const [id, raw] of Object.entries(parseMap(snapshotValue))) {
    if (!isRtdbKey(id) || !raw || raw.id !== id || unsafeKeyPath(raw)) continue;
    if (raw.published !== true) continue;
    projection[id] = normalizeNoticeRow(raw, { forcePublished: true });
  }
  return projection;
}

function assignmentAllowsTeacherNotice(assignments, teacherId, notice) {
  const targetClass = normalizeClassId(notice);
  if (!targetClass) return false;
  const targetGroup = normalizeSectionId(notice);
  return Object.values(parseMap(assignments)).some(assignment => {
    if (!assignment || String(assignment.teacherId || '') !== teacherId) return false;
    if (normalizeClassId(assignment) !== targetClass) return false;
    const assignmentGroup = normalizeSectionId(assignment);
    return targetGroup ? (!assignmentGroup || assignmentGroup === targetGroup) : !assignmentGroup;
  });
}

function checkClaims(user, claims) {
  const provider = claims?.firebase?.sign_in_provider || '';
  return noticeSyncPlan(claims, provider, user?.uid || '');
}

async function startCanonicalSync({ user, db, uid }) {
  const path = `${ROOT}/notices`;
  const node = ref(db, path);
  const stateKey = `${BASELINE_PREFIX}${uid}:canonical`;
  const bridge = createRecordSync({
    loadState: () => readJSON(stateKey, null),
    saveState: value => setJSON(stateKey, value),
    readLocal: () => localNoticeMap({ publishedOnly: true }),
    writeLocal: value => writeLocalNoticeMap(value, { preserveUnpublished: true }),
    commit: async operations => {
      const entries = Object.entries(operations).filter(([id, operation]) =>
        isRtdbKey(id) && (operation.value === null || (operation.value && !unsafeKeyPath(operation.value))));
      await Promise.all(entries.map(async ([id, operation]) => {
        const recordRef = ref(db, `${path}/${id}`);
        await runTransaction(recordRef, current => {
          const remote = current == null ? {} : { [id]: current };
          if (operation.seed && current != null) return current;
          const merged = mergeRecordOperations(remote, { [id]: operation });
          if (!Object.hasOwn(merged, id)) return null;
          if (current != null && stableJSON(merged[id]) === stableJSON(current)) return current;
          const value = normalizeNoticeRow(merged[id], { forcePublished: true });
          if (current && typeof current === 'object' && current.createdByUid) {
            value.createdByUid = current.createdByUid;
          }
          value.updatedByUid = user.uid;
          return value;
        }, { applyLocally: false });
      }));
      const snapshot = await get(node);
      return publicNoticeProjection(snapshot.val());
    }
  });
  const snapshot = await get(node);
  bridge.receive(snapshot.exists() ? publicNoticeProjection(snapshot.val()) : {});
  await bridge.flush();

  let connected = true;
  const stop = firebaseOnValue(node, snap => {
    bridge.receive(snap.exists() ? publicNoticeProjection(snap.val()) : {});
  }, error => console.warn('[Active Plus] v2 Notices unavailable:', error?.code || error?.name || 'unknown'));
  const stopConn = firebaseOnValue(ref(db, '.info/connected'), snap => {
    connected = snap.val() === true;
    if (connected) void bridge.flush().catch(() => {});
  });
  const onStorage = event => {
    if (event.apcRemote || (event.key && event.key !== KEYS.notices)) return;
    bridge.capture();
    if (connected && navigator.onLine) void bridge.flush().catch(() => {});
  };
  window.addEventListener('storage', onStorage);
  const timer = setInterval(() => {
    if (connected && navigator.onLine && bridge.hasPending()) void bridge.flush().catch(() => {});
  }, 3000);
  return () => {
    stop();
    stopConn();
    clearInterval(timer);
    window.removeEventListener('storage', onStorage);
  };
}

async function startTeacherSync({ user, db, plan }) {
  const [canonicalPath, draftsPath, assignmentsPath] = plan.readPaths;
  const outboxKey = `${OUTBOX_PREFIX}${user.uid}:teacher`;
  const ownedKey = `${OWNED_PREFIX}${user.uid}:teacher`;
  let pending = readOutbox(outboxKey);
  let ownedIds = readOwnedIds(ownedKey);
  let canonical = {};
  let drafts = {};
  let assignments = {};
  let assignmentsReady = false;
  let applyingRemote = false;
  let flushFlight = null;
  let connected = true;

  const persist = () => setJSON(outboxKey, pending);

  async function applyRemote() {
    applyingRemote = true;
    try {
      const current = localNoticeMap();
      const next = { ...current };
      const remoteIds = new Set([...Object.keys(canonical), ...Object.keys(drafts)]);
      for (const id of ownedIds) {
        if (!remoteIds.has(id) && !pending[id]) delete next[id];
      }
      for (const [id, row] of Object.entries(canonical)) {
        if (!pending[id]) next[id] = row;
      }
      for (const [id, draft] of Object.entries(drafts)) {
        if (!pending[id] && draft && draft.id === id) {
          next[id] = normalizeNoticeRow(draft, { forcePublished: false });
        }
      }
      for (const [id, row] of Object.entries(pending)) {
        if (isRtdbKey(id) && row && row.id === id && !unsafeKeyPath(row)) {
          next[id] = normalizeNoticeRow(row);
        }
      }
      writeLocalNoticeMap(next);
      ownedIds = new Set([...ownedIds, ...remoteIds]);
      setJSON(ownedKey, [...ownedIds]);
    } finally {
      applyingRemote = false;
    }
  }

  function captureLocal() {
    if (applyingRemote || !assignmentsReady) return;
    const local = localNoticeMap();
    for (const [id, row] of Object.entries(local)) {
      if (!assignmentAllowsTeacherNotice(assignments, plan.teacherId, row)) continue;
      const remoteMatch = row.published ? canonical[id] : drafts[id];
      if (!remoteMatch || stableJSON(remoteMatch) !== stableJSON(row)) {
        pending[id] = row;
      }
    }
    persist();
    void flushPending();
  }

  function flushPending() {
    if (flushFlight || !connected || !navigator.onLine) return flushFlight;
    flushFlight = (async () => {
      for (const [noticeId, notice] of Object.entries({ ...pending })) {
        if (!isRtdbKey(noticeId) || !notice || !assignmentAllowsTeacherNotice(assignments, plan.teacherId, notice) || unsafeKeyPath(notice)) continue;
        const normalized = normalizeNoticeRow(notice, { forcePublished: false });
        const draftPayload = {
          ...normalized,
          id: noticeId,
          authorUid: plan.authorUid,
          classId: String(normalized.classId || normalized.className || ''),
          group: String(normalized.group || ''),
          status: 'draft',
          published: false
        };
        try {
          await set(ref(db, `${draftsPath}/${noticeId}`), draftPayload);
          if (notice.published === true || notice.status === 'published') {
            await callCloudFunction('publishNotice', { noticeId });
          }
          if (stableJSON(pending[noticeId]) === stableJSON(notice)) delete pending[noticeId];
          persist();
        } catch (error) {
          console.warn('[Active Plus] v2 Notice draft queued:', error?.code || error?.name || 'unknown');
        }
      }
    })().finally(() => { flushFlight = null; });
    return flushFlight;
  }

  const [canonicalSnap, draftSnap, assignmentSnap] = await Promise.all([
    get(ref(db, canonicalPath)),
    get(ref(db, draftsPath)),
    get(ref(db, assignmentsPath))
  ]);
  canonical = publicNoticeProjection(canonicalSnap.val());
  drafts = parseMap(draftSnap.val());
  assignments = parseMap(assignmentSnap.val());
  assignmentsReady = true;
  await applyRemote();
  captureLocal();
  await flushPending();

  const stops = [
    firebaseOnValue(ref(db, canonicalPath), snap => {
      canonical = publicNoticeProjection(snap.val());
      void applyRemote();
    }, error => console.warn('[Active Plus] v2 Notices unavailable:', error?.code || error?.name || 'unknown')),
    firebaseOnValue(ref(db, draftsPath), snap => {
      drafts = parseMap(snap.val());
      void applyRemote();
    }, error => console.warn('[Active Plus] v2 Teacher notice drafts unavailable:', error?.code || error?.name || 'unknown')),
    firebaseOnValue(ref(db, assignmentsPath), snap => {
      assignments = parseMap(snap.val());
      assignmentsReady = true;
      captureLocal();
    }, error => console.warn('[Active Plus] v2 Teacher assignments unavailable:', error?.code || error?.name || 'unknown')),
    firebaseOnValue(ref(db, '.info/connected'), snap => {
      connected = snap.val() === true;
      if (connected) void flushPending();
    })
  ];
  const onStorage = event => {
    if (event.apcRemote || (event.key && event.key !== KEYS.notices)) return;
    captureLocal();
  };
  window.addEventListener('storage', onStorage);
  const timer = setInterval(() => {
    if (connected && navigator.onLine) void flushPending();
  }, 3000);
  return () => {
    stops.forEach(stop => stop());
    clearInterval(timer);
    window.removeEventListener('storage', onStorage);
  };
}

async function startReadonlyProjectionSync({ user, db, plan, scopeLabel }) {
  const node = ref(db, plan.readPath);
  const ownedKey = `${OWNED_PREFIX}${user.uid}:${scopeLabel}`;
  let ownedIds = readOwnedIds(ownedKey);
  const apply = snapshot => {
    const remote = publicNoticeProjection(snapshot.val());
    const current = localNoticeMap();
    const next = { ...current };
    const remoteIds = new Set(Object.keys(remote));
    for (const id of ownedIds) {
      if (!remoteIds.has(id)) delete next[id];
    }
    for (const [id, row] of Object.entries(remote)) {
      next[id] = row;
    }
    writeLocalNoticeMap(next);
    ownedIds = new Set([...ownedIds, ...remoteIds]);
    setJSON(ownedKey, [...ownedIds]);
  };
  const initial = await get(node);
  apply(initial);
  return firebaseOnValue(node, snapshot => apply(snapshot), error => {
    console.warn(`[Active Plus] v2 ${scopeLabel} Notices unavailable:`, error?.code || error?.name || 'unknown');
  });
}

export async function startNoticesV2Sync() {
  if (activeController) return { ok: true, alreadyStarted: true };
  await appCheckReady;
  const auth = getAuth(firebaseApp);
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: 'authentication-required' };
  if (user.isAnonymous === true) return { ok: false, reason: 'authenticated-claims-required' };
  const token = await user.getIdTokenResult(true);
  const plan = checkClaims(user, token.claims || {});
  if (!plan.ok) return { ok: false, reason: plan.reason };
  const db = getDatabase(firebaseApp);
  let stop;
  try {
    if (plan.mode === 'canonical') stop = await startCanonicalSync({ user, db, uid: user.uid });
    else if (plan.mode === 'teacher') stop = await startTeacherSync({ user, db, plan });
    else if (plan.mode === 'staff-readonly') stop = await startReadonlyProjectionSync({ user, db, plan, scopeLabel: 'staff' });
    else stop = await startReadonlyProjectionSync({ user, db, plan, scopeLabel: 'student' });
  } catch (error) {
    return { ok: false, reason: 'notices-v2-sync-failed', error };
  }
  const onSessionEnded = () => stopNoticesV2Sync();
  window.addEventListener('apc-session-ended', onSessionEnded, { once: true });
  activeController = {
    stop: () => {
      stop?.();
      window.removeEventListener('apc-session-ended', onSessionEnded);
      activeController = null;
    },
    uid: user.uid,
    role: plan.role
  };
  return { ok: true, role: plan.role, stop: activeController.stop };
}

export function stopNoticesV2Sync() {
  activeController?.stop();
}
