// The ONLY browser-side Firebase app initialization path. SDK is built locally
// by npm run build:firebase; App Check/emulators are configured before sync.
import {
  getApp, getApps, initializeApp, initializeAppCheck, ReCaptchaV3Provider,
  getAuth, connectAuthEmulator, getDatabase, connectDatabaseEmulator,
  getFirestore, connectFirestoreEmulator, getFunctions, connectFunctionsEmulator
} from '../vendor/firebase/sdk.js';
import { firebaseConfig, APP_CHECK_SITE_KEY, useFirebaseEmulators } from './firebase-config.js';

export const FUNCTIONS_REGION = 'asia-south1';
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Connect exactly once, before a client request or sign-in. No emulator path is
// reachable from a deployed host; the explicit URL flag works on loopback only.
if (useFirebaseEmulators) {
  connectAuthEmulator(getAuth(firebaseApp), 'http://localhost:9099', { disableWarnings: true });
  connectDatabaseEmulator(getDatabase(firebaseApp), 'localhost', 9000);
  connectFirestoreEmulator(getFirestore(firebaseApp), 'localhost', 8080);
  connectFunctionsEmulator(getFunctions(firebaseApp, FUNCTIONS_REGION), 'localhost', 5001);
}

function initAppCheck() {
  if (!APP_CHECK_SITE_KEY || useFirebaseEmulators) return;
  try {
    // The debug token is deliberately NEVER enabled on deployed origins.
    if (['localhost', '127.0.0.1'].includes(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
  } catch (error) {
    console.error('[Active Plus] App Check initialization failed:', error);
    throw error; // fail closed when a site key is configured
  }
}

export const appCheckReady = Promise.resolve().then(initAppCheck);
