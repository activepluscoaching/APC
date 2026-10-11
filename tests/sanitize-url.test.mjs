import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../js/sanitize-url.js', import.meta.url), 'utf8');

function run(search) {
  const calls = [];
  const window = {
    location: { search, pathname: '/admin.html', hash: '#finance' },
    history: {
      state: { marker: true },
      replaceState(...args) { calls.push(args); }
    }
  };
  runInNewContext(source, { window });
  return calls;
}

test('removes the whole query string from login-page history while preserving hash routes', () => {
  const calls = run('?username=admin.apc&password=secret&tracking=1');
  assert.deepEqual(calls, [[{ marker: true }, '', '/admin.html#finance']]);
});

test('does not rewrite URLs without a query string', () => {
  assert.deepEqual(run(''), []);
});
