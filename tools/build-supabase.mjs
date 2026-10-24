/* Deterministic local Supabase SDK bundle for static Hosting and offline PWA.
 * npm run build:supabase after changing SDK exports or the pinned version.
 * No service-role key or secret material goes into this bundle. */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('vendor/supabase', { recursive: true });

await build({
  entryPoints: ['tools/supabase-sdk-source.js'],
  bundle: true,
  minify: true,
  target: ['es2020'],
  platform: 'browser',
  format: 'esm',
  legalComments: 'none',
  logLevel: 'warning',
  outfile: 'vendor/supabase/sdk.js'
});
