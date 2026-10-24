import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const counters = { signIn: 0, reads: 0, signOut: 0, calls: 0 };
let claims = { role: 'teacher', status: 'active', mustChangePassword: false };
let profile = { uid: 'uid-1', role: 'teacher', status: 'active', email: 't@example.com' };
const auth = {
  currentUser: null,
  async signOut() { counters.signOut++; this.currentUser = null; },
  authStateReady: async () => {}
};
const user = { uid: 'uid-1', email: 't@example.com', isAnonymous: false,
  getIdTokenResult: async () => ({ signInProvider: 'password', claims }) };
const transport = {
  firebaseApp: {}, appCheckReady: Promise.resolve(), FUNCTIONS_REGION: 'asia-south1',
  getAuth: () => auth, browserLocalPersistence: {}, setPersistence: async () => {},
  signInWithEmailAndPassword: async (_auth, email) => { counters.signIn++; assert.equal(email, 't@example.com'); auth.currentUser = user; return { user }; },
  updatePassword: async () => {}, getFirestore: () => ({}), doc: (_db, ...path) => path.join('/'),
  getDoc: async path => { counters.reads++; return { exists: () => Boolean(path === 'users/uid-1' && profile), data: () => profile }; },
  getFunctions: () => ({}), httpsCallable: () => { counters.calls++; return async () => ({ data: {} }); }
};

test('email Auth boundary only accepts opt-in + trusted claims/profile and cleans rejected sessions', async () => {
  const oldLocation = globalThis.location, oldStorage = globalThis.sessionStorage;
  const values = new Map();
  globalThis.sessionStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  globalThis.location = { search: '?backend=firebase' };
  globalThis.__apcAuthClientTransport = transport;
  const hooks = registerHooks({ load(url, context, nextLoad) {
    if (url.endsWith('/firebase/firebase-init.js') || url.endsWith('/firebase/firebase-services.js')) {
      return { format: 'module', shortCircuit: true,
        source: `export const { ${Object.keys(transport).join(', ')} } = globalThis.__apcAuthClientTransport;` };
    }
    return nextLoad(url);
  } });
  try {
    const bridge = await import('../sync/cloud-auth.js');
    globalThis.location.search = '?backend=local';
    assert.equal((await bridge.signInCloudEmail('t@example.com', 'password')).reason, 'local-backend');
    assert.equal(counters.signIn, 0);
    globalThis.location.search = '?backend=firebase';
    assert.equal((await bridge.signInCloudEmail('username', 'password')).reason, 'invalid-credentials');
    assert.equal(counters.signIn, 0);
    let result = await bridge.signInCloudEmail(' T@EXAMPLE.COM ', 'password', { expectedRole: 'teacher' });
    assert.equal(result.ok, true);
    assert.equal(result.uid, 'uid-1');
    assert.equal(counters.reads, 1);
    claims = { ...claims, status: 'suspended' };
    result = await bridge.signInCloudEmail('t@example.com', 'password');
    assert.equal(result.reason, 'account-inactive');
    assert.equal(counters.reads, 1, 'inactive claims must not fetch the profile');
    assert.equal(auth.currentUser, null);
    claims = { role: 'teacher', status: 'active', mustChangePassword: true };
    result = await bridge.signInCloudEmail('t@example.com', 'password');
    assert.equal(result.reason, 'must-change-password');
    assert.equal(counters.reads, 1);
    assert.equal(auth.currentUser, user, 'only password-change session stays signed in');
    claims = { ...claims, mustChangePassword: false };
    profile = { ...profile, uid: 'wrong-uid' };
    result = await bridge.signInCloudEmail('t@example.com', 'password');
    assert.equal(result.reason, 'profile-mismatch');
    assert.equal(auth.currentUser, null);
    await assert.rejects(bridge.createFirstAdminCloud(), /Admin SDK bootstrap/);
    await assert.rejects(bridge.callCloudFunction('createFirstAdmin'), /Admin SDK bootstrap/);
    assert.equal(counters.calls, 0);
  } finally {
    hooks.deregister?.();
    delete globalThis.__apcAuthClientTransport;
    if (oldLocation === undefined) delete globalThis.location; else globalThis.location = oldLocation;
    if (oldStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = oldStorage;
  }
});
