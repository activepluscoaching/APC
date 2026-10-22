import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createIdGenerator, devicePrefix, dhakaYYMMDD, STUDENT_ID_REGEX } from '../js/idGenerator.js';

test('receipt IDs keep per-device prefix and Student IDs follow 9-digit YYMMDDSSS in Asia/Dhaka', async () => {
  const data = new Map();
  const store = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const prefix = devicePrefix(store);
  assert.equal(prefix, devicePrefix(store));
  const fixedNow = Date.parse('2026-10-22T06:00:00Z'); // 12:00 Asia/Dhaka -> 261022
  const gen = createIdGenerator({
    store,
    now: () => fixedNow,
    prefix: () => prefix,
    allocateOrdinal: (_, floor) => floor + 1
  });
  const first = await gen.nextReceiptNo([{ receiptNo: 'R261001001' }]);
  assert.equal(first, `${prefix}-000001`);
  assert.equal(await gen.nextReceiptNo([{ receiptNo: first }]), `${prefix}-000002`);

  const sid1 = await gen.nextStudentId([]);
  const sid2 = await gen.nextStudentId([{ id: sid1 }]);
  assert.match(sid1, STUDENT_ID_REGEX);
  assert.equal(sid1, `${dhakaYYMMDD(fixedNow)}001`);
  assert.equal(sid2, `${dhakaYYMMDD(fixedNow)}002`);
});
