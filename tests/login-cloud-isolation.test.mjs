import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/realtime-sync.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('export async function hydrateUserIdentifiers('), source.indexOf('\nfunction listenCollection'))
  .replace('export async function', 'async function');
function hydrate(student, directory) {
  return new Function('navigator', 'ensureCloudAuth', 'hydrateStudent', 'syncDirectory', 'syncError',
    `${body}; return hydrateUserIdentifiers;`)(
    { onLine: true }, async () => {}, student, directory, () => {});
}
test('verified cloud student does not wait for unrelated directory or registry writes', async () => {
  let calls = 0;
  const result = await hydrate(async () => ({ found: true }), async () => { calls++; throw Error('permission denied'); })({identifier:'student',password:'1234'});
  assert.deepEqual(result, {ok:true,found:true});
  assert.equal(calls, 0);
});
test('wrong password remains a credential mismatch even when unrelated sync fails', async () => {
  const result = await hydrate(async () => ({found:true,credentialMismatch:true}), async () => { throw Error('denied'); })({identifier:'student',password:'wrong'});
  assert.equal(result.ok, true);
  assert.equal(result.credentialMismatch, true);
});
test('directory lookup still runs for a non-student identifier', async () => {
  let calls = 0;
  const result = await hydrate(async () => ({found:false}), async () => {calls++;})({identifier:'teacher'});
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
});
test('a failed student read is not reported as account missing', async () => {
  const result = await hydrate(async () => {throw Error('offline');}, async () => {})({identifier:'student'});
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'identity-sync-failed');
});
