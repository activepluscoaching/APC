import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createIdGenerator, devicePrefix } from '../js/idGenerator.js';
test('per-device prefixed stable IDs with retained legacy rows', async () => {
  const data = new Map(); const store = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const prefix = devicePrefix(store); assert.equal(prefix, devicePrefix(store));
  const gen = createIdGenerator({ prefix: () => prefix, allocateOrdinal: (_, floor) => floor + 1 });
  const first = await gen.nextReceiptNo([{ receiptNo: 'R261001001' }]);
  assert.equal(first, `${prefix}-000001`);
  assert.equal(await gen.nextReceiptNo([{ receiptNo: first }]), `${prefix}-000002`);
  assert.equal(await gen.nextStudentId([]), `S${prefix.slice(1)}-000001`);
});
