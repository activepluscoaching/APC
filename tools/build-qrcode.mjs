/* Offline QR encoder. Rebuild after changing the pinned dev dependency. */
import { build } from 'esbuild';
await build({ stdin: { contents: "export { default } from 'qrcode-generator';", resolveDir: process.cwd() }, bundle: true,
  minify: true, platform: 'browser', format: 'esm', target: ['es2020'], legalComments: 'none', outfile: 'vendor/qrcode/encoder.js' });
