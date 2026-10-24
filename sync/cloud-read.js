/* Lazy, emulator-only browser adapter for reviewed read surfaces. Never install
 * as js/database.js's activeAdapter; it has no write, queue or local merge API.
 * Production Firebase identity does not yet authorize a production panel. */
import { firebaseApp, appCheckReady } from '../firebase/firebase-init.js';
import { firebaseEnvironment, useFirebaseEmulators } from '../firebase/firebase-config.js';
import { getAuth, getFirestore, doc, getDoc } from '../firebase/firebase-services.js';
import { backendMode } from './backend-selection.js';
import { LEGACY_CLOUD_ENABLED } from './cloud-access.js';
import { createCloudReadGateway } from './cloud-read-gateway.js';

const COLLECTIONS = new Set(['users', 'students', 'studentSummaries']);

export const stagedCloudReader = createCloudReadGateway({
  mode: backendMode,
  legacyEnabled: LEGACY_CLOUD_ENABLED,
  emulatorOnly: firebaseEnvironment === 'dev' && useFirebaseEmulators,
  async getCurrentUser() {
    await appCheckReady;
    const auth = getAuth(firebaseApp);
    await auth.authStateReady();
    return auth.currentUser;
  },
  async readDocument(collection, id) {
    if (!COLLECTIONS.has(collection) || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('read-not-allowed');
    const snapshot = await getDoc(doc(getFirestore(firebaseApp), collection, id));
    return snapshot.exists() ? snapshot.data() : null;
  }
});
