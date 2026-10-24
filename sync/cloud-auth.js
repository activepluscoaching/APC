/* Staged Firebase Auth boundary (not the localStorage login or anonymous RTDB
 * bridge). New login takes a REAL email. Never derive an Auth email from an
 * unverified username or copy local password hashes into Firebase. */
import { firebaseApp, appCheckReady, FUNCTIONS_REGION } from '../firebase/firebase-init.js';
import {
  getAuth, signInWithEmailAndPassword, updatePassword, setPersistence, browserLocalPersistence,
  getFirestore, doc, getDoc, getFunctions, httpsCallable
} from '../firebase/firebase-services.js';
import { backendMode } from './backend-selection.js';
import { LEGACY_CLOUD_ENABLED } from './cloud-access.js';
import { normalizeAuthEmail, checkCloudIdentity } from './cloud-identity-policy.js';

export async function signInCloudEmail(email, password, { expectedRole = '' } = {}) {
  if (backendMode() !== 'firebase') return { ok: false, reason: 'local-backend' };
  // A URL changed without a page reload cannot detach an already-running RTDB
  // bridge. Never put email Auth into its shared anonymous-compatible tree.
  if (LEGACY_CLOUD_ENABLED) return { ok: false, reason: 'reload-required' };
  const address = normalizeAuthEmail(email);
  if (!address || !String(password || '')) return { ok: false, reason: 'invalid-credentials' };
  const auth = getAuth(firebaseApp);
  try {
    await appCheckReady;
    await setPersistence(auth, browserLocalPersistence);
    const credential = await signInWithEmailAndPassword(auth, address, String(password));
    const user = credential.user;
    const token = await user.getIdTokenResult(true);
    // No Firestore profile is read for an inactive account or an invalid role.
    const early = checkCloudIdentity({ user, token, expectedRole });
    if (!early.ok && early.reason !== 'profile-mismatch' && early.reason !== 'student-profile-mismatch') {
      if (early.reason === 'must-change-password') {
        return { ok: false, reason: early.reason, user }; // password change callable needs this Auth session
      }
      await auth.signOut();
      return early;
    }
    const firestore = getFirestore(firebaseApp);
    const snapshot = await getDoc(doc(firestore, 'users', user.uid));
    const userProfile = snapshot.exists() ? snapshot.data() : null;
    let studentProfile = null;
    if (token.claims?.role === 'student') {
      const studentSnapshot = await getDoc(doc(firestore, 'students', user.uid));
      studentProfile = studentSnapshot.exists() ? studentSnapshot.data() : null;
    }
    const decision = checkCloudIdentity({ user, token, profile: userProfile, studentProfile, expectedRole });
    if (!decision.ok) {
      await auth.signOut();
      return decision;
    }
    return { ...decision, user, claims: token.claims, userProfile, studentProfile };
  } catch (error) {
    try { await auth.signOut(); } catch { /* fail closed on network errors too */ }
    return { ok: false, reason: error?.code || 'auth-failed' };
  }
}

// Compatibility name, but a username must not become a made-up email address.
export const signInCloudUsername = signInCloudEmail;

export async function currentCloudUser() {
  if (backendMode() !== 'firebase' || LEGACY_CLOUD_ENABLED) return null;
  await appCheckReady;
  const auth = getAuth(firebaseApp);
  await auth.authStateReady();
  return auth.currentUser;
}

export async function signOutCloud() {
  return getAuth(firebaseApp).signOut();
}

export async function callCloudFunction(name, data = {}) {
  if (name === 'createFirstAdmin') throw new Error('First Admin requires trusted Admin SDK bootstrap');
  await appCheckReady;
  const callable = httpsCallable(getFunctions(firebaseApp, FUNCTIONS_REGION), name);
  const result = await callable(data);
  return result.data;
}

export async function createFirstAdminCloud() {
  throw new Error('First Admin requires trusted Admin SDK bootstrap');
}

export async function changeCloudPassword(nextPassword) {
  const auth = getAuth(firebaseApp);
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Firebase email login required');
  await updatePassword(user, String(nextPassword));
  const result = await callCloudFunction('completeTemporaryPasswordChange', {});
  await user.getIdToken(true);
  return result;
}
