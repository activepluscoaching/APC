/* Deterministic local Firebase SDK bundles for static Hosting and offline PWA.
 * npm run build:firebase after changing SDK exports/config or the pinned version.
 * No Admin SDK, service-account material or environment secrets go into these. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const common = {
  bundle: true,
  minify: true,
  target: ['es2020'],
  platform: 'browser',
  legalComments: 'none',
  logLevel: 'warning'
};
await build({ ...common, entryPoints: ['tools/firebase-sdk-source.js'], format: 'esm', outfile: 'vendor/firebase/sdk.js' });
await build({ ...common, entryPoints: ['tools/firebase-messaging-compat-source.js'], format: 'iife', outfile: 'vendor/firebase/messaging-compat.js' });
// Firebase's minified template contains literal spaces immediately before a
// newline. Escape the spaces inside that template to preserve runtime output
// without introducing trailing whitespace into the generated Git artifact.
const sdkPath = 'vendor/firebase/sdk.js';
const sdk = readFileSync(sdkPath, 'utf8');
writeFileSync(sdkPath, sdk.replaceAll('`  \n', '`\\x20\\x20\n'));
