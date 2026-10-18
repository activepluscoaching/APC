import test from 'node:test';
import assert from 'node:assert/strict';
import { getTimeThemeHour } from '../js/theme.js';

test('Student Home greeting uses the same Dhaka clock as its time-of-day artwork', () => {
  const instant = new Date('2026-10-18T13:30:00.000Z');
  assert.equal(getTimeThemeHour(instant, true), 19, '13:30 UTC is 19:30 in Dhaka');
  assert.equal(getTimeThemeHour(instant, false), instant.getHours(), 'other portals keep device-local time');
});
