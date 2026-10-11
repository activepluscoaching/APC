/* Exercise the actual sync lifecycle against a controllable Firebase boundary.
   Brief drops, failed writes and partial reads must not churn subscriptions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { loadPage } from './jsdom-harness.mjs';
import { KEYS } from '../js/database.js';

const wait = async (predicate, timeout = 2500) => {
  const until = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > until) throw new Error('condition timed out');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

test('a transient disconnect preserves listeners and retries a failed collection alone', async t => {
  const ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  globalThis.Storage = ctx.window.Storage;
  const values = new Map();
  const listeners = new Map();
  const reads = [];
  const writes = [];
  let onValueCalls = 0;
  let blockedCollection = false;
  let rejectWrites = false;
  let online = true;
  Object.defineProperty(ctx.window.navigator, 'onLine', { configurable: true, get: () => online });
  const snap = path => ({ exists: () => values.has(path), val: () => values.get(path) ?? null });
  const auth = { currentUser: { uid: 'mock-anon' }, authStateReady: async () => {} };
  const transport = {
    firebaseApp: {}, appCheckReady: Promise.resolve(),
    getAuth: () => auth, signInAnonymously: async () => {},
    setPersistence: async () => {}, browserLocalPersistence: {},
    getDatabase: () => ({}), ref: (_, path) => path,
    get: async path => {
      reads.push(path);
      if (blockedCollection && path === 'activePlusSync/v1/notices') throw Error('temporary read outage');
      return snap(path);
    },
    set: async (path, value) => { if (rejectWrites) throw Error('temporary write outage'); writes.push(path); values.set(path, value); },
    runTransaction: async (path, update) => {
      if (rejectWrites) throw Error('temporary write outage');
      const next = update(values.get(path) ?? null);
      if (next !== undefined) { writes.push(path); values.set(path, next); }
      return { snapshot: snap(path), committed: next !== undefined };
    },
    onValue: (path, callback, onError) => {
      onValueCalls++;
      const listener = { callback, onError };
      listeners.set(path, listener);
      return () => { if (listeners.get(path) === listener) listeners.delete(path); };
    }
  };
  globalThis.__syncReconnectTransport = transport;
  const hooks = registerHooks({ load(url, context, nextLoad) {
    // Test-only opt-in: production ships a hard disabled policy and deny-all rules.
    if (url.endsWith('/sync/cloud-access.js')) {
      const original = nextLoad(url, context);
      return { ...original, source: String(original.source).replace('LEGACY_CLOUD_ENABLED = false', 'LEGACY_CLOUD_ENABLED = true') };
    }
    if (url.endsWith('/firebase/firebase-init.js') || url.endsWith('/firebase/firebase-services.js')) {
      return { format: 'module', shortCircuit: true,
        source: `export const { ${Object.keys(transport).join(', ')} } = globalThis.__syncReconnectTransport;` };
    }
    return nextLoad(url, context);
  } });
  t.after(() => { hooks.deregister(); ctx.window.close(); delete globalThis.__syncReconnectTransport; });
  const storage = await import('../js/storage.js');
  await storage.persistAccount({ username: 'sync.student', mobile: '01712345678', pin: '123456',
    student: { id: 'SYNC-1', name: 'Student' } });
  await storage.persistSession(true);
  const sync = await import('../js/realtime-sync.js');
  assert.equal((await sync.startRealtimeSync()).ok, true);
  assert.ok(listeners.has('.info/connected'));
  listeners.get('.info/connected').callback({ val: () => true });
  await wait(() => ctx.document.documentElement.dataset.realtimeSync === 'online');
  const originalListeners = onValueCalls;
  const originalReads = reads.length;

  // Browser network and Firebase connection signals can race in either order.
  online = false;
  ctx.window.dispatchEvent(new ctx.window.Event('offline'));
  listeners.get('.info/connected').callback({ val: () => false });
  await wait(() => ctx.document.documentElement.dataset.realtimeSync === 'offline');
  online = true;
  ctx.window.dispatchEvent(new ctx.window.Event('online'));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(onValueCalls, originalListeners, 'online must not rebuild healthy listeners');
  assert.equal(reads.length, originalReads, 'online must not rehydrate all collections');
  assert.equal(ctx.document.documentElement.dataset.realtimeSync, 'offline', 'not synced until RTDB confirms');
  listeners.get('.info/connected').callback({ val: () => true });
  await wait(() => ctx.document.documentElement.dataset.realtimeSync === 'online');

  // A transient write rejection keeps the local outbox, not a permanent failed
  // transport requiring a full re-read every 15 seconds.
  rejectWrites = true;
  const sample = [{ id: 'STU-1', name: 'Local edit' }];
  ctx.window.localStorage.setItem(KEYS.students, JSON.stringify(sample));
  await wait(() => ctx.document.documentElement.dataset.realtimeSync === 'error');
  rejectWrites = false;
  assert.equal((await sync.startRealtimeSync()).ok, true);
  await wait(() => values.get('activePlusSync/v1/students')?.['STU-1']);
  assert.equal(onValueCalls, originalListeners, 'retry writes without rebuilding the listener set');
  assert.equal(ctx.document.documentElement.dataset.realtimeSync, 'online');

  // A cancelled Firebase listener is different from a write rejection: retry
  // must reattach it, even if the transport itself is still connected.
  const cancelled = listeners.get('activePlusSync/v1/notices');
  cancelled.onError({ code: 'permission-denied' });
  assert.equal(ctx.document.documentElement.dataset.realtimeSync, 'error');
  assert.equal(ctx.document.documentElement.dataset.firebaseConnection, 'connected');
  assert.equal((await sync.startRealtimeSync()).ok, true);
  assert.notEqual(listeners.get('activePlusSync/v1/notices'), cancelled);

  // A different collection failing at boot is tracked and retried on reconnect;
  // it must not be mislabeled synced or permanently abandoned.
  ctx.window.dispatchEvent(new ctx.window.Event('apc-session-ended'));
  blockedCollection = true;
  await storage.persistSession(true);
  assert.equal((await sync.startRealtimeSync()).ok, true);
  listeners.get('.info/connected').callback({ val: () => true });
  await wait(() => ctx.document.documentElement.dataset.realtimeSync === 'error');
  await new Promise(resolve => setTimeout(resolve, 20));
  blockedCollection = false;
  listeners.get('.info/connected').callback({ val: () => false });
  listeners.get('.info/connected').callback({ val: () => true });
  await wait(() => ctx.document.documentElement.dataset.realtimeSync === 'online');
  ctx.window.dispatchEvent(new ctx.window.Event('apc-session-ended'));
});
