/* Update delivery — a new build must reach an installed app on its own;
   nobody should have to clear the cache by hand (owner report 2026-10-15).
   The worker activates immediately (skipWaiting + clients.claim in sw.js),
   so the fragile link was discovery: a browser may answer an update check
   with its HTTP-cached copy of the worker script. These pins keep the
   discovery path honest:
     • the registration URL carries the build number, so every release asks
       for a script URL that has never been cached;
     • the registered number can never drift from sw.js's CACHE_VERSION
       (which also names the cache and every HTML asset pin);
     • a visible app re-checks instead of waiting for the browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sw = read('sw.js');
const registrar = read('js/service-worker.js');
const cacheVersion = Number(sw.match(/const CACHE_VERSION = (\d+)/)?.[1]);

test('the registered worker URL carries the build number', () => {
  assert.ok(Number.isSafeInteger(cacheVersion) && cacheVersion >= 1, 'CACHE_VERSION is a build number');
  const registered = Number(registrar.match(/export const SW_VERSION = (\d+)/)?.[1]);
  assert.equal(registered, cacheVersion, 'SW_VERSION must equal CACHE_VERSION or updates silently stall');
  assert.match(registrar, /register\(`\.\/sw\.js\?v=\$\{SW_VERSION\}`\)/,
    'registration must use the versioned worker URL');
  assert.equal(registrar.includes("register('./sw.js')"), false, 'the unversioned worker URL is gone');
});

test('the worker still activates immediately and the app re-checks on return', () => {
  assert.match(sw, /await self\.skipWaiting\(\)/, 'a new worker must not wait for tabs to close');
  assert.match(sw, /await self\.clients\.claim\(\)/, 'open pages come under the new worker at once');
  assert.match(sw, /key !== CACHE_NAME/, 'activate deletes every older cache');
  assert.match(registrar, /registration\.update\(\)/, 'registration forces an update check');
  assert.match(registrar, /visibilitychange/, 'a returning user triggers a fresh check');
  assert.match(registrar, /নতুন সংস্করণ আছে/, 'the update banner still offers the refresh');
});

test('every page pin agrees with the build the worker will cache', () => {
  /* Two legacy per-file pins predate the release pin and are deliberately
     not the build number (theme logo swapper, a sync-border asset). Student's
     isolated Home hero stages only these known CSS/JS paths at v379 while the
     established page/worker build remains 378; the cache-first worker may
     resolve a stale file by pathname when an older query is present. */
  const legacy = new Set([158, 25161005]);
  const stagedStudentHeroPaths = new Set([
    'css/hero-cards.css',
    'js/hero-cards.js',
    'js/student-home-hero-entry.js',
    'js/student-home-daily-hero.js'
  ]);
  for (const page of ['index.html', 'student.html', 'admin.html', 'manager.html', 'teacher.html', 'payment.html']) {
    const html = read(page);
    let pinned = 0;
    for (const [, path, pin] of html.matchAll(/([^\s"'<>?]+)\?v=(\d+)/g)) {
      if (legacy.has(Number(pin)) ||
          (page === 'student.html' && Number(pin) === 379 && stagedStudentHeroPaths.has(path))) continue;
      assert.equal(Number(pin), cacheVersion, `${page} pins an asset to another build`);
      pinned += 1;
    }
    assert.ok(pinned >= 10, `${page} really is pinned to this build`);
  }
});
