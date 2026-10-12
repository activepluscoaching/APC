// Active Plus — compatibility export for the protected Firebase layer.
// Keep this file only so legacy modules continue to work during the migration.
// New code must import from ../firebase/*.
export { firebaseApp, appCheckReady } from '../firebase/firebase-init.js';
export { firebaseConfig, APP_CHECK_SITE_KEY, FCM_VAPID_KEY } from '../firebase/firebase-config.js';
