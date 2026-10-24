// Build input only. Browser modules import the generated, same-origin bundle
// through firebase-init.js / firebase-services.js; do not import this source.
export { getApp, getApps, initializeApp } from 'firebase/app';
export {
  getAuth, signInAnonymously, signInWithEmailAndPassword, updatePassword,
  setPersistence, browserLocalPersistence, connectAuthEmulator
} from 'firebase/auth';
export { getDatabase, ref, get, set, remove, runTransaction, onValue, connectDatabaseEmulator } from 'firebase/database';
export {
  getFirestore, doc, getDoc, connectFirestoreEmulator,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager
} from 'firebase/firestore';
export { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
export { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
export { getMessaging, getToken, deleteToken, onMessage } from 'firebase/messaging';
