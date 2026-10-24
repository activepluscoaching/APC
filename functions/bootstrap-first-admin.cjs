#!/usr/bin/env node
/* Operator-only first Admin: ADC (managed identity / gcloud login) or local
 * Auth + Firestore emulators. Never put a password or service-account key in
 * arguments, browser code, the repository, or a log. No public callable. */
const readline = require('node:readline/promises');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { bootstrapFirstAdmin } = require('./first-admin-bootstrap-core.cjs');

function secretQuestion(rl, prompt) {
  process.stdout.write(prompt);
  // Node 22 readline writes through rl.output, not _writeToOutput. Silence
  // redraws while retaining terminal input; never echo or log a password.
  const output = rl.output;
  rl.output = { write: () => true };
  return rl.question('').finally(() => { rl.output = output; process.stdout.write('\n'); });
}

async function main() {
  const projectId = process.argv.find(arg => arg.startsWith('--project='))?.slice('--project='.length)
    || process.env.FIREBASE_PROJECT_ID;
  if (!projectId || !/^[a-z][a-z0-9-]{4,29}$/.test(projectId) || projectId === 'dev' || projectId === 'prod') {
    throw new Error('Supply the REAL project ID with --project=<id> (not a Firebase CLI alias)');
  }
  const production = projectId === 'active-plus-coaching';
  if (production && !process.argv.includes('--allow-production=active-plus-coaching')) {
    throw new Error('Production bootstrap requires explicit --allow-production=active-plus-coaching');
  }
  const authEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const firestoreEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (authEmulator !== firestoreEmulator) throw new Error('Auth and Firestore emulators must BOTH be configured');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Interactive terminal required; never pass passwords via arguments or environment');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let profile;
  try {
    const email = await rl.question('Admin email: ');
    const username = await rl.question('Admin username (stable handle): ');
    const fullName = await rl.question('Full name: ');
    const password = await secretQuestion(rl, 'Password (12+ characters): ');
    const confirmation = await secretQuestion(rl, 'Confirm password: ');
    if (password !== confirmation) throw new Error('Passwords do not match');
    profile = { email, username, fullName, password };
  } finally { rl.close(); }

  const app = initializeApp({ projectId, ...(!authEmulator ? { credential: applicationDefault() } : {}) });
  const result = await bootstrapFirstAdmin({
    auth: getAuth(app), db: getFirestore(app), serverTimestamp: () => FieldValue.serverTimestamp(), profile
  });
  console.log(`First Admin created for ${projectId}: ${result.uid} (${result.email})`);
}
main().catch(error => {
  // Never print arbitrary SDK error messages: they can contain supplied input.
  const code = String(error?.code || '');
  const safeMessages = new Set([
    'Supply the REAL project ID with --project=<id> (not a Firebase CLI alias)',
    'Production bootstrap requires explicit --allow-production=active-plus-coaching',
    'Auth and Firestore emulators must BOTH be configured',
    'Interactive terminal required; never pass passwords via arguments or environment',
    'Passwords do not match', 'Admin already initialized or username reserved',
    'Admin bootstrap lock changed; do not retry blindly',
    'A real email address is required for Firebase Auth', 'Admin username is invalid',
    'Admin name must be 2–100 characters', 'Admin password must be 12–128 characters'
  ]);
  const reason = /^[a-z-]+\/[a-z-]+$/.test(code) ? code
    : safeMessages.has(error?.message) ? error.message : 'Provisioning failed; inspect project state before retrying';
  console.error(`Bootstrap failed: ${reason}`);
  process.exitCode = 1;
});
