// Active Plus — public WEB app settings only; no service-account credentials.
// A dev host must never silently use the existing project's configuration.
import { devFirebaseConfig, devHosts, devAppCheckSiteKey, devFcmVapidKey } from './firebase-config.dev.js';

export const productionFirebaseConfig = Object.freeze({
  apiKey: 'AIzaSyAD1OsM47YTu8Z6itpUkvDFdPXaCh1Bmrw',
  authDomain: 'active-plus-coaching.firebaseapp.com',
  // Realtime Database instance: active-plus-coaching-default-rtdb (Singapore).
  databaseURL: 'https://active-plus-coaching-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'active-plus-coaching',
  storageBucket: 'active-plus-coaching.firebasestorage.app',
  messagingSenderId: '876005018709',
  appId: '1:876005018709:web:26de8a656e96ac631d58dc',
  measurementId: 'G-R4TYJ6ECDJ'
});

// Public reCAPTCHA/FCM Web keys; leave empty until each project is registered.
const productionAppCheckSiteKey = '';
const productionFcmVapidKey = '';

const host = globalThis.location?.hostname?.toLowerCase() || '';
const params = new URLSearchParams(globalThis.location?.search || '');
const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(host);
// Arena's live preview is an untrusted development origin, NOT the deployed
// production app. Never let a preview tab silently read/write production RTDB.
// Its browser cannot reach an emulator on the sandbox's localhost: use only a
// separate, synthetic-data dev project here after its real Web config is set.
const isPreviewHost = /^[a-z0-9-]+\.e2b\.app$/.test(host);
const isDevHost = isPreviewHost || devHosts.includes(host) || /-dev\.(web\.app|firebaseapp\.com)$/.test(host);
// sanitize-url.js removes queries before modules load; retain its allowlisted,
// tab-scoped selection and validate it exactly as an explicit URL choice.
let savedProject = '';
try { savedProject = globalThis.sessionStorage?.getItem('apc.firebaseProject') || ''; } catch { /* storage disabled */ }
const requested = params.get('firebaseProject') || globalThis.__apcPublicFlags?.firebaseProject || savedProject;
if (requested && !['dev', 'prod'].includes(requested)) throw new Error('Unknown Firebase project selection');
if (isDevHost && requested === 'prod') throw new Error('Production Firebase is forbidden on a development host');
if (requested === 'dev' && !(isLoopback || isDevHost)) throw new Error('Development Firebase is forbidden on this host');
// Panel navigation drops the URL query. Remember ONLY the local dev selection
// for this tab, never across browser sessions and never on a deployed origin.
let localDev = false;
let localEmulator = false;
if (isLoopback) {
  try {
    if (requested) sessionStorage.setItem('apc.firebaseProject', requested);
    if (params.has('firebaseEmulator')) sessionStorage.setItem('apc.firebaseEmulator', params.get('firebaseEmulator'));
    localDev = (requested || sessionStorage.getItem('apc.firebaseProject')) === 'dev';
    localEmulator = (params.get('firebaseEmulator') || globalThis.__apcPublicFlags?.firebaseEmulator || sessionStorage.getItem('apc.firebaseEmulator')) === '1';
  } catch {
    // Storage disabled: the explicit URL works only on the current page.
    localDev = requested === 'dev';
    localEmulator = (params.get('firebaseEmulator') || globalThis.__apcPublicFlags?.firebaseEmulator) === '1';
  }
}
export const firebaseEnvironment = isDevHost || localDev ? 'dev' : 'prod';
if (firebaseEnvironment === 'dev' && (!devFirebaseConfig.apiKey || !devFirebaseConfig.projectId ||
    !devFirebaseConfig.appId || !devFirebaseConfig.authDomain || !devFirebaseConfig.databaseURL)) {
  throw new Error('Development Firebase web app is not configured; see FIREBASE_SETUP.md');
}
if (firebaseEnvironment === 'dev' && (devFirebaseConfig.projectId === productionFirebaseConfig.projectId ||
    devFirebaseConfig.appId === productionFirebaseConfig.appId ||
    devFirebaseConfig.databaseURL === productionFirebaseConfig.databaseURL)) {
  throw new Error('Development and production Firebase projects must be different');
}
if (firebaseEnvironment === 'dev') {
  // Do not trust a changed projectId with the old production databaseURL (or
  // another project's instance): that would expose real data from a preview.
  let url;
  try { url = new URL(devFirebaseConfig.databaseURL); } catch { throw new Error('Invalid development Realtime Database URL'); }
  const hostName = url.hostname.toLowerCase();
  const project = devFirebaseConfig.projectId.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' ||
      url.search || url.hash || !(
        hostName === `${project}.firebaseio.com` ||
        (hostName.startsWith(`${project}-`) && hostName.endsWith('.firebasedatabase.app'))
      )) throw new Error('Development Realtime Database must belong to the development project');
}
export const firebaseConfig = firebaseEnvironment === 'dev' ? devFirebaseConfig : productionFirebaseConfig;
export const APP_CHECK_SITE_KEY = firebaseEnvironment === 'dev' ? devAppCheckSiteKey : productionAppCheckSiteKey;
export const FCM_VAPID_KEY = firebaseEnvironment === 'dev' ? devFcmVapidKey : productionFcmVapidKey;

// Opt-in only on loopback; never connect a deployed site to a browser's local
// emulators. Use a separate dev project ID in firebase-config.dev.js first.
export const useFirebaseEmulators = isLoopback && firebaseEnvironment === 'dev' && localEmulator;