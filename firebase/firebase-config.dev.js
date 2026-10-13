// Public Firebase WEB app settings for a SEPARATE development project.
// Register the dev web app in Firebase Console, then replace these empty fields.
// These identifiers and the reCAPTCHA site key are public, NOT Admin secrets.
// Add custom development Hosting domains to hosts to select this config there.
// Never put a service account, private key, or Admin SDK credential here.
export const devFirebaseConfig = Object.freeze({
  apiKey: '',
  authDomain: '',
  databaseURL: '', // only when the legacy RTDB bridge is deliberately tested
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
});
export const devHosts = Object.freeze([]);
export const devAppCheckSiteKey = '';
export const devFcmVapidKey = '';
