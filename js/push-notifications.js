import { LEGACY_CLOUD_ENABLED, assertCloudAccess } from '../sync/cloud-access.js';
/* Push transport (FCM) for the notification centre.

   What this file does when it is fully configured:
     • asks for the notification permission (the caller does that first),
     • fetches this device's FCM token and stores a small record under
       activePlusSync/v1/pushTokens/<device|viewer> so the sender — the Cloud
       Functions in functions/index.js — knows which devices to push to,
     • shows a notification for a message that arrives while the app is open.

   Everything here is optional: with no VAPID key in js/firebase-config.js the
   module reports `needs-key` and the in-app centre keeps working. Nothing in
   the record is a secret — no password hash and no session token is ever added.

   The legacy bridge is currently disabled and deny-all rules protect these
   nodes. Token registration stays paused until a per-account, server-verified
   authentication/authorization migration replaces the anonymous transport. */

import { readJSON, writeJSON } from './storage.js';
import { getDeviceId } from './session.js';
import { SHOWN_KEY, claimDelivery, pushTokenRecord, tokenPathKey } from './notification-rules.js';

export const PUSH_LOCAL_KEY = 'activePlus.push.device.v1';
const TOKENS_ROOT = 'activePlusSync/v1/pushTokens';
/* Same specifier as the entry point, so the browser reuses ONE sync module
   instance (two copies would install two write bridges). */
const SYNC_MODULE = './realtime-sync.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.2.1';

export function pushState() {
  const record = readJSON(PUSH_LOCAL_KEY, null);
  return record && typeof record === 'object' ? record : null;
}

function permission() {
  try { return 'Notification' in window ? window.Notification.permission : 'unsupported'; }
  catch { return 'unsupported'; }
}

function supported() {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
    if (window.isSecureContext === false) return false;
    return true;
  } catch { return false; }
}

async function config() {
  const module = await import('./firebase-config.js');
  return module;
}

/** What the UI and the setup guide need to explain the current state. */
export async function pushSupport() {
  const secure = typeof window !== 'undefined' ? window.isSecureContext !== false : true;
  let hasKey = false;
  try { hasKey = Boolean((await config()).FCM_VAPID_KEY); } catch { hasKey = false; }
  return {
    supported: supported(),
    secureContext: secure,
    permission: permission(),
    hasVapidKey: hasKey,
    state: pushState()
  };
}

async function firebase() {
  assertCloudAccess();
  const { firebaseApp } = await config();
  // The sync module owns the anonymous session; asking it (instead of signing
  // in again here) keeps one identity per device.
  const sync = await import(SYNC_MODULE);
  await sync.ensureCloudAuth();
  const databaseModule = await import(`${SDK}/firebase-database.js`);
  return { firebaseApp, databaseModule };
}

async function messagingModule() {
  return import(`${SDK}/firebase-messaging.js`);
}

function writeLocal(state) {
  writeJSON(PUSH_LOCAL_KEY, { version: 1, ...state });
}

/** Ask the browser for a token and publish it for the sender. */
export async function enablePush({ viewer } = {}) {
  if (!LEGACY_CLOUD_ENABLED) return { ok: false, status: 'cloud-paused' };
  if (!supported()) return { ok: false, status: 'unsupported' };
  if (permission() !== 'granted') return { ok: false, status: 'denied' };
  let vapidKey = '';
  try { vapidKey = (await config()).FCM_VAPID_KEY || ''; } catch { vapidKey = ''; }
  if (!vapidKey) {
    writeLocal({ status: 'needs-key', at: Date.now(), permission: 'granted' });
    return { ok: true, status: 'needs-key' };
  }
  try {
    const { firebaseApp } = await firebase();
    const { getMessaging, getToken, onMessage } = await messagingModule();
    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, { vapidKey });
    if (!token) throw new Error('no-token');
    const published = await publishToken({ token, viewer });
    onMessage(messaging, payload => { void showForeground(payload); });
    writeLocal({ status: published.ok ? 'registered' : 'local-only', token, at: Date.now(), permission: 'granted', node: published.node });
    return { ok: true, status: published.ok ? 'registered' : 'local-only', token };
  } catch (error) {
    writeLocal({ status: 'error', at: Date.now(), permission: 'granted', code: String(error?.code || error?.name || '').slice(0, 60) });
    console.warn('[Active Plus] push registration failed:', error?.code || error?.name || 'unknown');
    return { ok: false, status: 'error' };
  }
}

/** Refresh the stored record (token rotation, role change) on a later start.
    A page load is not a reason to write to the cloud: the record is only
    re-published when it is missing or stale. */
export async function syncPushRegistration({ viewer, maxAgeMs = 6 * 60 * 60 * 1000 } = {}) {
  if (!LEGACY_CLOUD_ENABLED) return { ok: false, status: 'cloud-paused' };
  if (!supported() || permission() !== 'granted') return { ok: false, status: 'inactive' };
  const state = pushState();
  if (!state?.token) return enablePush({ viewer });
  if (Number(state.at) && Date.now() - Number(state.at) < maxAgeMs && state.status === 'registered') {
    return { ok: true, status: 'cached' };
  }
  try {
    const published = await publishToken({ token: state.token, viewer });
    writeLocal({ ...state, status: published.ok ? 'registered' : 'local-only', at: Date.now(), node: published.node });
    return { ok: published.ok, status: published.ok ? 'registered' : 'local-only' };
  } catch {
    return { ok: false, status: 'offline' };
  }
}

async function publishToken({ token, viewer }) {
  const record = pushTokenRecord({
    token,
    viewer,
    deviceId: getDeviceId(),
    platform: navigator.userAgent || '',
    locale: navigator.language || ''
  });
  if (!record) return { ok: false, node: '' };
  const node = `${TOKENS_ROOT}/${tokenPathKey(getDeviceId(), viewer)}`;
  try {
    const { firebaseApp, databaseModule } = await firebase();
    const database = databaseModule.getDatabase(firebaseApp);
    await databaseModule.set(databaseModule.ref(database, node), record);
    return { ok: true, node };
  } catch (error) {
    console.warn('[Active Plus] push token not published:', error?.code || error?.name || 'unknown');
    return { ok: false, node };
  }
}

export async function disablePush() {
  const state = pushState();
  try {
    if (state?.token) {
      const { firebaseApp, databaseModule } = await firebase();
      if (state.node) await databaseModule.remove(databaseModule.ref(databaseModule.getDatabase(firebaseApp), state.node));
      const { getMessaging, deleteToken } = await messagingModule();
      await deleteToken(getMessaging(firebaseApp));
    }
    writeLocal({ status: 'off', at: Date.now(), permission: permission() });
    return { ok: true, status: 'off' };
  } catch (error) {
    writeLocal({ status: 'error', at: Date.now(), code: String(error?.code || error?.name || '').slice(0, 60) });
    return { ok: false, status: 'error' };
  }
}

/** A message that arrives while the app is open is displayed by this page. */
async function showForeground(payload) {
  // Same identity as the local engine (the item key): one record can raise
  // several different notifications (an exam: scheduled, starting, started).
  const id = payload?.data?.key || payload?.data?.id || payload?.messageId || 'push';
  const { claim, record } = claimDelivery(readJSON(SHOWN_KEY, null), id);
  writeJSON(SHOWN_KEY, record);
  if (!claim) return;                      // the sync bridge already showed this one
  const title = payload?.notification?.title || payload?.data?.title || 'Active Plus';
  const body = payload?.notification?.body || payload?.data?.body || '';
  const options = {
    body,
    icon: './assets/icons/icon-192.png',
    tag: payload?.data?.key || payload?.messageId || 'active-plus-push',
    data: payload?.data || {}
  };
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, options);
  } catch {
    try { new window.Notification(title, options); } catch { /* permission changed */ }
  }
  window.dispatchEvent(new CustomEvent('apc-push-message', { detail: { title, body } }));
}
