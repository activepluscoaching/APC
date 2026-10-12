/* Active Plus — authenticated Firebase identity bridge.
 * Usernames map to the private Auth email namespace created by trusted Functions.
 * Passwords are handled only by Firebase Auth and are never stored here.
 */
import { firebaseApp, appCheckReady } from '../firebase/firebase-init.js';
import {
  getAuth, signInWithEmailAndPassword, updatePassword, setPersistence, browserLocalPersistence,
  getFirestore, doc, getDoc, getFunctions, httpsCallable
} from '../firebase/firebase-services.js';

const DOMAIN = 'accounts.activeplus.app';

export function authEmailForUsername(username) {
  const value = String(username || '').trim().toLowerCase();
  return value ? `user.${value}@${DOMAIN}` : '';
}

export async function signInCloudUsername(username, password) {
  const email = authEmailForUsername(username);
  if (!email || !String(password || '')) return { ok: false, reason: 'invalid-credentials' };
  await appCheckReady;
  const auth = getAuth(firebaseApp);
  await setPersistence(auth, browserLocalPersistence);
  try {
    const credential = await signInWithEmailAndPassword(auth, email, String(password));
    const token = await credential.user.getIdTokenResult(true);
    const claims = token.claims || {};
    if (claims.status && !['active', 'approved'].includes(claims.status)) {
      return { ok: false, reason: 'account-inactive', claims, user: credential.user };
    }
    if (claims.mustChangePassword === true) {
      return { ok: false, reason: 'must-change-password', claims, user: credential.user };
    }
    const firestore = getFirestore(firebaseApp);
    const userSnapshot = await getDoc(doc(firestore, 'users', credential.user.uid));
    const userProfile = userSnapshot.exists() ? userSnapshot.data() : null;
    let studentProfile = null;
    if (claims.role === 'student') {
      const studentSnapshot = await getDoc(doc(firestore, 'students', credential.user.uid));
      studentProfile = studentSnapshot.exists() ? studentSnapshot.data() : null;
    }
    return { ok: true, user: credential.user, claims, userProfile, studentProfile };
  } catch (error) {
    return { ok: false, reason: error?.code || 'auth-failed', error };
  }
}

export async function currentCloudUser() {
  await appCheckReady;
  const auth = getAuth(firebaseApp);
  await auth.authStateReady();
  return auth.currentUser;
}

export async function signOutCloud() {
  return getAuth(firebaseApp).signOut();
}


export async function callCloudFunction(name, data = {}) {
  await appCheckReady;
  const callable = httpsCallable(getFunctions(firebaseApp), name);
  const result = await callable(data);
  return result.data;
}

export async function createFirstAdminCloud(profile) {
  return callCloudFunction('createFirstAdmin', profile);
}


export async function changeCloudPassword(nextPassword) {
  const auth = getAuth(firebaseApp);
  const user = auth.currentUser;
  if (!user) throw new Error('Firebase login required');
  await updatePassword(user, String(nextPassword));
  const result = await callCloudFunction('completeTemporaryPasswordChange', {});
  await user.getIdToken(true);
  return result;
}
