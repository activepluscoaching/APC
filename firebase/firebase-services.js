// Single local SDK import surface. Do not import Firebase directly from UI modules.
export {
  getAuth, signInAnonymously, signInWithEmailAndPassword, updatePassword,
  setPersistence, browserLocalPersistence,
  getDatabase, ref, get, set, remove, runTransaction, onValue,
  getFirestore, doc, getDoc,
  getFunctions, httpsCallable,
  getMessaging, getToken, deleteToken, onMessage
} from '../vendor/firebase/sdk.js';
