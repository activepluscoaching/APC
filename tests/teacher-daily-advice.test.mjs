import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEACHER_DAILY_ADVICE, pickTeacherAdvice } from '../js/teacher-daily-advice.js';
import { quoteDateKey, quoteDayNumber } from '../js/daily-quote.js';

test('the teacher advice library is a clean, Bengali, de-duplicated set', () => {
  assert.ok(TEACHER_DAILY_ADVICE.length >= 14, 'enough lines for a meaningful daily rotation');
  for (const line of TEACHER_DAILY_ADVICE) {
    assert.equal(typeof line, 'string');
    assert.ok(line.trim().length > 0, 'no empty advice');
    assert.doesNotMatch(line, /[A-Za-z]/, 'advice is fully Bengali (no English labels)');
    assert.match(line, /[ঀ-৿]/, 'advice contains Bengali text');
  }
  assert.equal(new Set(TEACHER_DAILY_ADVICE).size, TEACHER_DAILY_ADVICE.length, 'no duplicate advice');
  /* The no-JS fallback written in teacher.html stays the library's first line. */
  const html = readFileSync(new URL('../teacher.html', import.meta.url), 'utf8');
  /* The warm line may also carry Tailwind utilities (layout lives on the
     element now); only its text has to stay the library head. */
  const warm = html.match(/<p class="teacher-hero-warm[^"]*">([^<]+)<\/p>/);
  assert.ok(warm, 'the hero keeps a warm-line element');
  assert.equal(warm[1].trim(), TEACHER_DAILY_ADVICE[0], 'the static fallback matches advice[0]');
});

test('the pick is deterministic for one Dhaka day and always returns a library line', () => {
  const now = Date.parse('2026-10-21T09:00:00Z');
  const first = pickTeacherAdvice(now);
  assert.equal(first, pickTeacherAdvice(now), 'same instant always gives the same advice');
  assert.ok(TEACHER_DAILY_ADVICE.includes(first), 'the pick belongs to the library');

  const expectedIndex = ((quoteDayNumber(quoteDateKey(now)) % TEACHER_DAILY_ADVICE.length) + TEACHER_DAILY_ADVICE.length) % TEACHER_DAILY_ADVICE.length;
  assert.equal(first, TEACHER_DAILY_ADVICE[expectedIndex], 'the pick follows day-number rotation');

  for (const value of [undefined, 0, Date.now()]) {
    const picked = pickTeacherAdvice(value);
    assert.equal(typeof picked, 'string');
    assert.ok(picked.length > 0, 'a usable line even for edge inputs');
  }
});

test('consecutive Dhaka days show different advice, so it changes daily', () => {
  const dayOne = Date.parse('2026-10-21T00:00:00Z'); // 06:00 Dhaka
  const dayTwo = dayOne + 24 * 60 * 60 * 1000;       // next Dhaka day, 06:00
  assert.notEqual(quoteDateKey(dayOne), quoteDateKey(dayTwo), 'the fixtures span two Dhaka days');
  assert.notEqual(pickTeacherAdvice(dayOne), pickTeacherAdvice(dayTwo), 'tomorrow rotates to another line');
});

test('the rotation walks every line instead of repeating a subset', () => {
  const start = Date.parse('2026-10-21T00:00:00Z');
  const seen = new Set();
  for (let offset = 0; offset < TEACHER_DAILY_ADVICE.length; offset += 1) {
    seen.add(pickTeacherAdvice(start + offset * 24 * 60 * 60 * 1000));
  }
  assert.equal(seen.size, TEACHER_DAILY_ADVICE.length, 'over one cycle every advice line appears');
});
