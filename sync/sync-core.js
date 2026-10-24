import { assertCloudAccess } from './cloud-access.js';
import { setSyncStatus } from './sync-status.js';
import { isSupabaseRuntimeEnabled } from './supabase-config.js';
// Protected Sync Core facade.
// UI imports this boundary; Firebase + Supabase implementations load lazily.
//
// IMPORTANT: hydration is single-flight at this boundary. Login, first-use
// setup, reconnect and background sync must not run the same credential
// hydration concurrently or race to rewrite local state.
const implementation = async () => {
  assertCloudAccess();
  return import('../js/realtime-sync.js');
};

const supabaseImplementation = async () => {
  assertCloudAccess();
  if (!isSupabaseRuntimeEnabled()) return null;
  return import('../js/supabase-sync.js');
};

async function startDualRealtimeSync(...args) {
  const [fbMod, sbMod] = await Promise.all([
    implementation(),
    supabaseImplementation().catch(() => null)
  ]);
  const [fbResult, sbResult] = await Promise.all([
    fbMod.startRealtimeSync(...args),
    sbMod ? sbMod.startSupabaseSync(...args).catch(error => ({ ok: false, error })) : Promise.resolve(null)
  ]);
  if (fbResult?.ok) return fbResult;
  if (sbResult?.ok) {
    setSyncStatus('online');
    return { ok: true, mode: 'supabase-failover', supabaseOk: true };
  }
  return fbResult;
}

let staffHydrationFlight = null;
const identityHydrationFlights = new Map();
let adminStateFlight = null;
let adminClaimFlight = null;

function identityFlightKey(options = {}) {
  return JSON.stringify([
    String(options?.identifier || ''),
    String(options?.password || '')
  ]);
}

function hydrateStaffAccountsOnce(...args) {
  if (staffHydrationFlight) return staffHydrationFlight;
  staffHydrationFlight = (async () => {
    const [fbMod, sbMod] = await Promise.all([
      implementation(),
      supabaseImplementation().catch(() => null)
    ]);
    const [fbRes, sbRes] = await Promise.all([
      fbMod.hydrateStaffAccounts(...args),
      sbMod ? sbMod.hydrateStaffAccountsSupabase(...args).catch(() => ({ ok: false })) : Promise.resolve({ ok: false })
    ]);
    return fbRes?.ok ? fbRes : (sbRes?.ok ? sbRes : fbRes);
  })().finally(() => { staffHydrationFlight = null; });
  return staffHydrationFlight;
}

function hydrateUserIdentifiersOnce(options = {}) {
  const key = identityFlightKey(options);
  if (identityHydrationFlights.has(key)) return identityHydrationFlights.get(key);
  const flight = (async () => {
    const [fbMod, sbMod] = await Promise.all([
      implementation(),
      supabaseImplementation().catch(() => null)
    ]);
    const fbRes = await fbMod.hydrateUserIdentifiers(options);
    if (fbRes?.ok && fbRes?.found) return fbRes;
    if (sbMod) {
      const sbRes = await sbMod.hydrateUserIdentifiersSupabase(options).catch(() => null);
      if (sbRes?.ok && (sbRes.found || !fbRes?.ok)) return sbRes;
    }
    return fbRes;
  })().finally(() => { identityHydrationFlights.delete(key); });
  identityHydrationFlights.set(key, flight);
  return flight;
}

/* The first-use gate is asked once per page load while the answer is in flight
   (the login page checks at startup, before showing its login screen, and again
   before it lets the creation form submit). */
function adminInitializationStateOnce() {
  if (adminStateFlight) return adminStateFlight;
  adminStateFlight = (async () => {
    const [fbMod, sbMod] = await Promise.all([
      implementation(),
      supabaseImplementation().catch(() => null)
    ]);
    const [fbRes, sbRes] = await Promise.all([
      fbMod.adminInitializationState(),
      sbMod ? sbMod.adminInitializationStateSupabase().catch(() => null) : Promise.resolve(null)
    ]);
    if (fbRes?.ok && fbRes.initialized) return fbRes;
    if (sbRes?.ok && sbRes.initialized) return sbRes;
    if (fbRes?.ok) return fbRes;
    if (sbRes?.ok) return sbRes;
    return fbRes;
  })().finally(() => { adminStateFlight = null; });
  return adminStateFlight;
}

async function firstAdminExistsDual() {
  const state = await adminInitializationStateOnce();
  return state?.ok ? { ok: true, exists: Boolean(state.initialized) } : state;
}

/* Creating the institution's Admin Account is a single write: two clicks (or
   two tabs) must never race into two cloud claims. */
function claimFirstAdminAccountOnce(record, ...rest) {
  if (adminClaimFlight) return adminClaimFlight;
  adminClaimFlight = (async () => {
    const [fbMod, sbMod] = await Promise.all([
      implementation(),
      supabaseImplementation().catch(() => null)
    ]);
    const fbRes = await fbMod.claimFirstAdminAccount(record, ...rest);
    if (fbRes?.ok) {
      if (sbMod) {
        await sbMod.claimFirstAdminAccountSupabase(record).catch(() => {});
      }
      return fbRes;
    }
    if (fbRes?.reason === 'claim-failed' && sbMod) {
      const sbRes = await sbMod.claimFirstAdminAccountSupabase(record).catch(() => null);
      if (sbRes?.ok || sbRes?.reason === 'admin-exists') return sbRes;
    }
    return fbRes;
  })().finally(() => { adminClaimFlight = null; });
  return adminClaimFlight;
}

/* The factory reset is one destructive sweep: a double click must never start
   a second wipe while the first one is still running. */
let resetFlight = null;
function resetCloudDatabaseOnce(...args) {
  if (resetFlight) return resetFlight;
  resetFlight = (async () => {
    const [fbMod, sbMod] = await Promise.all([
      implementation(),
      supabaseImplementation().catch(() => null)
    ]);
    const [fbRes, sbRes] = await Promise.all([
      fbMod.resetCloudDatabase(...args),
      sbMod ? sbMod.resetSupabaseDatabase().catch(() => ({ ok: false })) : Promise.resolve(null)
    ]);
    if (fbRes?.ok) return fbRes;
    if (sbRes?.ok && fbRes?.reason === 'reset-failed') return sbRes;
    return fbRes;
  })().finally(() => { resetFlight = null; });
  return resetFlight;
}

async function usernameTakenDual(username) {
  const [fbMod, sbMod] = await Promise.all([
    implementation(),
    supabaseImplementation().catch(() => null)
  ]);
  const [fbRes, sbRes] = await Promise.all([
    fbMod.usernameTakenOnline(username),
    sbMod ? sbMod.usernameTakenSupabase(username).catch(() => null) : Promise.resolve(null)
  ]);
  if (fbRes?.taken || sbRes?.taken) return { ok: true, taken: true };
  if (fbRes?.ok) return fbRes;
  if (sbRes?.ok) return sbRes;
  return fbRes;
}

async function registerStudentDual(options = {}) {
  const [fbMod, sbMod] = await Promise.all([
    implementation(),
    supabaseImplementation().catch(() => null)
  ]);
  const fbRes = await fbMod.registerStudentAtomicallyOnline(options);
  if (fbRes?.ok) {
    if (sbMod) {
      const prebuilt = fbRes.cloudAccount && fbRes.studentRow
        ? {
            cloudAccount: fbRes.cloudAccount,
            studentRow: fbRes.studentRow,
            notificationRecord: fbRes.notificationRecord || null
          }
        : null;
      void sbMod.registerStudentAtomicallySupabase({
        ...options,
        preferredStudentId: fbRes.studentId || options.preferredStudentId,
        prebuiltRecords: prebuilt
      }).catch(() => {});
    }
    return fbRes;
  }
  if (fbRes?.reason === 'network-unavailable' && sbMod) {
    const sbRes = await sbMod.registerStudentAtomicallySupabase(options);
    if (sbRes?.ok || sbRes?.reason === 'duplicate' || sbRes?.reason === 'daily-limit') {
      return sbRes;
    }
  }
  return fbRes;
}

async function syncRegistrationDecisionDual(options = {}) {
  const [fbMod, sbMod] = await Promise.all([
    implementation(),
    supabaseImplementation().catch(() => null)
  ]);
  const [fbRes, sbRes] = await Promise.all([
    fbMod.syncRegistrationDecisionOnline(options),
    sbMod ? sbMod.syncRegistrationDecisionSupabase(options).catch(() => null) : Promise.resolve(null)
  ]);
  return fbRes?.ok ? fbRes : (sbRes?.ok ? sbRes : fbRes);
}

async function refreshStudentApprovalDual(account) {
  const [fbMod, sbMod] = await Promise.all([
    implementation(),
    supabaseImplementation().catch(() => null)
  ]);
  const [fbRes, sbRes] = await Promise.all([
    fbMod.refreshStudentApprovalOnline(account),
    sbMod ? sbMod.refreshStudentApprovalSupabase(account).catch(() => null) : Promise.resolve(null)
  ]);
  if (fbRes?.ok && fbRes.status && fbRes.status !== 'pending') return fbRes;
  if (sbRes?.ok && sbRes.status && sbRes.status !== 'pending') return sbRes;
  return fbRes?.ok ? fbRes : (sbRes?.ok ? sbRes : fbRes);
}

async function pollRegistrationFeedDual() {
  const [fbMod, sbMod] = await Promise.all([
    implementation(),
    supabaseImplementation().catch(() => null)
  ]);
  const [fbRes, sbRes] = await Promise.all([
    fbMod.pollRegistrationFeedOnline(),
    sbMod ? sbMod.pollRegistrationFeedSupabase().catch(() => null) : Promise.resolve(null)
  ]);
  return fbRes?.ok ? fbRes : (sbRes?.ok ? sbRes : fbRes);
}

export const SyncService = Object.freeze({
  start: (...args) => startDualRealtimeSync(...args),
  syncNow: (...args) => startDualRealtimeSync(...args),
  ensureCloudAuth: (...args) => implementation().then(m => m.ensureCloudAuth(...args)),
  hydrateStaffAccounts: (...args) => hydrateStaffAccountsOnce(...args),
  firstAdminExistsOnline: () => firstAdminExistsDual(),
  adminInitializationState: () => adminInitializationStateOnce(),
  claimFirstAdminAccount: (...args) => claimFirstAdminAccountOnce(...args),
  resetCloudDatabase: (...args) => resetCloudDatabaseOnce(...args),
  hydrateUserIdentifiers: (...args) => hydrateUserIdentifiersOnce(...args),
  usernameTakenOnline: (...args) => usernameTakenDual(...args),
  registerStudentAtomicallyOnline: (...args) => registerStudentDual(...args),
  syncRegistrationDecisionOnline: (...args) => syncRegistrationDecisionDual(...args),
  refreshStudentApprovalOnline: (...args) => refreshStudentApprovalDual(...args),
  pollRegistrationFeedOnline: (...args) => pollRegistrationFeedDual(...args),
  getServerTimeMs: (...args) => implementation().then(m => m.getServerTimeMs(...args)),
  getStatus: () => ({ ...document.documentElement.dataset })
});

export const startRealtimeSync = (...args) => startDualRealtimeSync(...args);
export const ensureCloudAuth = (...args) => implementation().then(m => m.ensureCloudAuth(...args));
export const hydrateStaffAccounts = (...args) => hydrateStaffAccountsOnce(...args);
export const firstAdminExistsOnline = () => firstAdminExistsDual();
export const adminInitializationState = () => adminInitializationStateOnce();
export const claimFirstAdminAccount = (...args) => claimFirstAdminAccountOnce(...args);
export const resetCloudDatabase = (...args) => resetCloudDatabaseOnce(...args);
export const hydrateUserIdentifiers = (...args) => hydrateUserIdentifiersOnce(...args);
export const registerStudentAtomicallyOnline = (...args) => registerStudentDual(...args);
export const syncRegistrationDecisionOnline = (...args) => syncRegistrationDecisionDual(...args);
export const refreshStudentApprovalOnline = (...args) => refreshStudentApprovalDual(...args);
export const pollRegistrationFeedOnline = (...args) => pollRegistrationFeedDual(...args);
export const getServerTimeMs = (...args) => implementation().then(m => m.getServerTimeMs(...args));
