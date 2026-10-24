import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { dhakaDateTimeInput, parseDhakaDateTime } from '../js/time.js';
test('exam schedule has fixed Dhaka offset even on UTC host', () => {
  assert.equal(parseDhakaDateTime('2026-10-14T18:30'), Date.parse('2026-10-14T12:30:00Z'));
  assert.equal(dhakaDateTimeInput(Date.parse('2026-10-14T12:30:00Z')), '2026-10-14T18:30');
  assert.throws(() => parseDhakaDateTime('2026-02-30T10:30'));
});
