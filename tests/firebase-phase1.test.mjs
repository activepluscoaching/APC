import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = path => readFileSync(resolve(root, path), 'utf8');
const config = JSON.parse(source('firebase.json'));
const csp = config.hosting.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;

function webConfig(hostname, search = '', savedProject = '', devConfig = null) {
  const program = `globalThis.location = { hostname: ${JSON.stringify(hostname)}, search: ${JSON.stringify(search)} };
    globalThis.sessionStorage = { getItem: key => key === 'apc.firebaseProject' ? ${JSON.stringify(savedProject)} : null, setItem() {} };
    if (${JSON.stringify(Boolean(devConfig))}) {
      const { registerHooks } = await import('node:module');
      registerHooks({ load(url, context, nextLoad) {
        if (url.endsWith('/firebase/firebase-config.dev.js')) return { format: 'module', shortCircuit: true,
          source: 'export const devFirebaseConfig = Object.freeze(' + ${JSON.stringify(JSON.stringify(devConfig))} + '); export const devHosts = []; export const devAppCheckSiteKey = ""; export const devFcmVapidKey = "";' };
        return nextLoad(url, context);
      } });
    }
    try { const m = await import('./firebase/firebase-config.js'); console.log(JSON.stringify({ environment: m.firebaseEnvironment, projectId: m.firebaseConfig.projectId, databaseURL: m.firebaseConfig.databaseURL, emulators: m.useFirebaseEmulators })); }
    catch (e) { console.log(JSON.stringify({ error: e.message })); }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test('the explicit dev selection fails closed instead of falling back to production', () => {
  const existing = webConfig('active-plus-coaching.web.app');
  assert.equal(existing.projectId, 'active-plus-coaching');
  assert.equal(existing.environment, 'prod');
  assert.equal(webConfig('active-plus-coaching.web.app', '?firebaseProject=dev').error,
    'Development Firebase is forbidden on this host');
  assert.equal(webConfig('active-plus-coaching.web.app', '', 'dev').error,
    'Development Firebase is forbidden on this host', 'sanitize-url may strip the query, not its restriction');
  assert.equal(webConfig('localhost', '', 'invalid').error, 'Unknown Firebase project selection');
  assert.equal(webConfig('localhost', '', 'dev').error, 'Development Firebase web app is not configured; see FIREBASE_SETUP.md');
  const dev = webConfig('my-school-dev.web.app');
  assert.equal(dev.error || dev.environment, dev.error ? 'Development Firebase web app is not configured; see FIREBASE_SETUP.md' : 'dev');
  if (!dev.error) assert.notEqual(dev.projectId, existing.projectId);
  assert.equal(webConfig('localhost', '?firebaseEmulator=1').emulators, false, 'emulators require explicit dev selection');
  const local = webConfig('localhost', '?firebaseProject=dev&firebaseEmulator=1');
  if (!local.error) assert.equal(local.emulators, true);
});

test('preview is dev-only, cannot silently connect to production RTDB or use its URL', () => {
  const preview = '8088-sandbox.e2b.app';
  assert.equal(webConfig(preview).error, 'Development Firebase web app is not configured; see FIREBASE_SETUP.md');
  assert.equal(webConfig(preview, '?firebaseProject=prod').error, 'Production Firebase is forbidden on a development host');
  assert.equal(webConfig(preview, '', 'prod').error, 'Production Firebase is forbidden on a development host');
  const dev = { apiKey: 'public-dev-key', authDomain: 'apc-sandbox-dev.firebaseapp.com',
    databaseURL: 'https://apc-sandbox-dev-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'apc-sandbox-dev', appId: '1:123456:web:dev-only' };
  assert.deepEqual(webConfig(preview, '', '', dev), { environment: 'dev', projectId: 'apc-sandbox-dev',
    databaseURL: dev.databaseURL, emulators: false });
  assert.equal(webConfig(preview, '', '', { ...dev, databaseURL: 'https://active-plus-coaching-default-rtdb.asia-southeast1.firebasedatabase.app' }).error,
    'Development and production Firebase projects must be different');
  assert.equal(webConfig(preview, '', '', { ...dev, databaseURL: 'http://apc-sandbox-dev.firebaseio.com' }).error,
    'Development Realtime Database must belong to the development project');
  assert.equal(webConfig(preview, '', '', { ...dev, projectId: 'active-plus-coaching' }).error,
    'Development and production Firebase projects must be different');
  assert.equal(webConfig('active-plus-coaching.web.app', '', '', dev).environment, 'prod');
});

test('Firebase is bundled, same-origin and available to the offline shell', () => {
  assert.ok(statSync(resolve(root, 'vendor/firebase/sdk.js')).size > 100_000);
  assert.ok(statSync(resolve(root, 'vendor/firebase/messaging-compat.js')).size > 10_000);
  assert.match(source('vendor/firebase/messaging-compat.js'), /e2b/, 'FCM worker must share the preview/dev guard');
  assert.match(source('vendor/firebase/messaging-compat.js'), /Development Realtime Database must belong to the development project/);
  for (const file of ['firebase/firebase-init.js', 'firebase/firebase-services.js', 'js/push-notifications.js', 'firebase-messaging-sw.js']) {
    assert.doesNotMatch(source(file), /https:\/\/www\.gstatic\.com\/firebasejs\//);
  }
  assert.match(source('firebase/firebase-init.js'), /\.\.\/vendor\/firebase\/sdk\.js/);
  assert.match(source('firebase-messaging-sw.js'), /\.\/vendor\/firebase\/messaging-compat\.js/);
  assert.match(source('sw.js'), /\.\/vendor\/firebase\/sdk\.js/);
  assert.match(source('sw.js'), /\.\/vendor\/firebase\/messaging-compat\.js/);
});

test('region, emulators, indexes and CSP agree; service worker leaves APIs uncached', () => {
  assert.match(source('functions/index.js'), /setGlobalOptions\(\{ region: 'asia-south1' \}\)/);
  assert.match(source('firebase/firebase-init.js'), /FUNCTIONS_REGION = 'asia-south1'/);
  assert.match(source('sync/cloud-auth.js'), /getFunctions\(firebaseApp, FUNCTIONS_REGION\)/);
  assert.equal(config.firestore.indexes, 'firestore.indexes.json');
  assert.ok(Array.isArray(JSON.parse(source('firestore.indexes.json')).indexes));
  for (const name of ['auth', 'functions', 'firestore', 'database', 'hosting']) assert.ok(config.emulators[name].port);
  for (const port of [5001, 8080, 9000, 9099]) assert.match(csp, new RegExp(`http://localhost:${port}`));
  for (const page of ['index.html', 'admin.html', 'manager.html', 'teacher.html', 'payment.html']) {
    assert.match(source(page), new RegExp(`http://localhost:8080`));
  }
  assert.match(source('sw.js'), /isFirebaseServiceRequest\(event\.request\)/);
  assert.match(source('sw.js'), /firebasedatabase/);
});
