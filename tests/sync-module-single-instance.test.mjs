/* js/realtime-sync.js owns device-wide state: the write bridge, the outbox
   listeners and the connection status. The browser keys a module by URL, so two
   specifiers — the same file with a different cache query — would create two
   instances and two competing engines. Every importer must share one specifier;
   the notification module (js/push-notifications.js) reuses this exact one. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const jsDir = fileURLToPath(new URL('../js/', import.meta.url));

test('every module imports one and the same sync instance', () => {
  const specifiers = new Set();
  for (const name of readdirSync(jsDir)) {
    if (!name.endsWith('.js') || name === 'realtime-sync.js') continue;
    const source = readFileSync(jsDir + name, 'utf8');
    for (const match of source.matchAll(/['"]\.\/realtime-sync\.js(?:\?[^'"]*)?['"]/g)) specifiers.add(match[0]);
  }
  assert.ok(specifiers.size > 0, 'the sync module is imported somewhere');
  assert.deepEqual([...specifiers], ["'./realtime-sync.js'"], 'all direct imports use the canonical, unversioned implementation URL');
  const facade = readFileSync(new URL('../sync/sync-core.js', import.meta.url), 'utf8');
  assert.match(facade, /import\('\.\.\/js\/realtime-sync\.js'\)/);
});
