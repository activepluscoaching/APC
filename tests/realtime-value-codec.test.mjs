import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeRealtimeRecords, decodeRealtimeRecords } from '../js/realtime-value-codec.js';
import { collectionPayload, remoteToLocal } from '../js/sync-collections.js';

test('nested empty arrays/objects and dotted keys survive RTDB transport', () => {
  const value = { 'a.b': { progress: {}, classes: [], map: { 'teacher.apc': { assigned: [] } } } };
  const encoded = encodeRealtimeRecords(value);
  assert.equal(Object.hasOwn(encoded, 'a.b'), false);
  assert.deepEqual(decodeRealtimeRecords(encoded), value);
  const verify = obj => {
    if (!obj || typeof obj !== 'object') return;
    assert.notEqual(Object.keys(obj).length, 0, 'there are no empty nodes for Firebase to discard');
    for (const [key, item] of Object.entries(obj)) { assert.doesNotMatch(key, /[.#$\[\]/]/); verify(item); }
  };
  verify(encoded);
});

test('transport marker fields in real data are escaped and round-trip literally', () => {
  const value = { a: { __apc_empty_array_v1__: true }, b: { __apc_empty_object_v1__: true } };
  assert.deepEqual(decodeRealtimeRecords(encodeRealtimeRecords(value)), value);
  assert.deepEqual(decodeRealtimeRecords({ a: { title: 'legacy' } }), { a: { title: 'legacy' } });
});

test('routine flattens by class ID rather than overwriting a whole day', () => {
  const local = { sat: { date: 'today', classes: [{ id: 'R1', subject: 'Math' }, { id: 'R2', subject: 'English' }] } };
  const records = collectionPayload('routine', local);
  assert.equal(records.R1._syncDay, 'sat');
  assert.equal(records.R2.subject, 'English');
  const result = remoteToLocal('routine', records);
  assert.deepEqual(result.sat, local.sat);
  assert.deepEqual(result.sun.classes, []);
  assert.equal(Object.hasOwn(result.sat.classes[0], '_syncDay'), false);
});

test('explicit null fields survive even though RTDB deletes null nodes', () => {
  const value = { a: { note: null, list: [null, 'x'], nested: { keep: null, drop: 'y' } } };
  const encoded = encodeRealtimeRecords(value);
  const verify = node => {
    if (Array.isArray(node)) return node.forEach(verify);
    if (!node || typeof node !== 'object') { assert.notEqual(node, null, 'no bare null reaches the database'); return; }
    for (const child of Object.values(node)) verify(child);
  };
  verify(encoded);
  assert.deepEqual(decodeRealtimeRecords(encoded), value);
});

test('undefined fields are dropped the way JSON.stringify drops them', () => {
  const encoded = encodeRealtimeRecords({ a: { kept: 1, gone: undefined } });
  assert.equal(Object.hasOwn(encoded.a, 'gone'), false);
  assert.deepEqual(decodeRealtimeRecords(encoded), { a: { kept: 1 } });
});

test('a numeric-keyed map from the database is rebuilt as a list', () => {
  // What the SDK returns for an array that lost a hole, or for hand-written data.
  const stored = { exams: { 0: { id: 'E1' }, 1: { id: 'E2' } }, notes: { a: { id: 'N1' } } };
  const decoded = decodeRealtimeRecords(stored);
  assert.deepEqual(decoded.exams, [{ id: 'E1' }, { id: 'E2' }]);
  assert.equal(Array.isArray(decoded.notes), false, 'a real map is left alone');
  assert.equal(Array.isArray(decodeRealtimeRecords({ list: { 0: 'a', 2: 'c' } }).list), false, 'a gap stays a map');
});
