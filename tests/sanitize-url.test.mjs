import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../js/sanitize-url.js', import.meta.url), 'utf8');

function run(search, storageBlocked = false) {
  const calls = [];
  const session = new Map();
  const window = {
    location: { search, pathname: '/admin.html', hash: '#finance' },
    sessionStorage: { setItem(key, value) { if (storageBlocked) throw new Error('blocked'); session.set(key, value); } },
    history: {
      state: { marker: true },
      replaceState(...args) { calls.push(args); }
    }
  };
  runInNewContext(source, { window, URLSearchParams });
  return { calls, session, flags: window.__apcPublicFlags };
}

test('removes the whole query string from login-page history while preserving hash routes', () => {
  const { calls, session } = run('?username=admin.apc&password=secret&tracking=1');
  assert.deepEqual(calls, [[{ marker: true }, '', '/admin.html#finance']]);
  assert.equal(session.size, 0, 'credentials and tracking are never persisted');
});

test('does not rewrite URLs without a query string', () => {
  assert.deepEqual(run('').calls, []);
});

test('captures only fixed public mode flags for modules before removing all query parameters', () => {
  const { calls, session } = run('?backend=firebase&firebaseProject=dev&firebaseEmulator=1&password=secret');
  assert.deepEqual(calls, [[{ marker: true }, '', '/admin.html#finance']]);
  assert.deepEqual([...session], [
    ['apc.backend', 'firebase'], ['apc.firebaseProject', 'dev'], ['apc.firebaseEmulator', '1']
  ]);
  const invalid = run('?backend=unknown&firebaseProject=attacker&firebaseEmulator=untrusted');
  assert.equal(invalid.session.has('apc.backend'), false);
  assert.equal(invalid.session.get('apc.firebaseProject'), 'invalid');
  assert.equal(invalid.session.get('apc.firebaseEmulator'), '0');
  const privateMode = run('?backend=firebase&firebaseProject=dev&password=secret', true);
  assert.equal(privateMode.session.size, 0);
  assert.equal(privateMode.flags.backend, 'firebase');
  assert.equal(privateMode.flags.firebaseProject, 'dev');
});
