/* Login "account not found" — one short message, by owner decision.

   The student login used to narrate its cloud lookup when an account was
   missing: how many student accounts the cloud holds, which similar names
   might match, spelling advice and "open the app on the other device"
   sync instructions. The owner asked for all of that to go: a missing
   account only ever says «অ্যাকাউন্ট পাওয়া যায়নি।»

   Genuinely different failures keep their own words — a wrong password,
   an ambiguous short Student ID, and a cloud that could not be checked
   at all must not be reported as "not found". */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('the login never narrates the cloud lookup for a missing account', () => {
  const js = read('js/login.js');
  assert.doesNotMatch(js, /ক্লাউডে .*শিক্ষার্থী অ্যাকাউন্ট আছে/, 'no cloud census');
  assert.doesNotMatch(js, /ক্লাউডে এখনো কোনো শিক্ষার্থী অ্যাকাউন্ট ওঠেনি/, 'no empty-cloud story');
  assert.doesNotMatch(js, /মিলে যেতে পারে/, 'no similar-name guesses');
  assert.doesNotMatch(js, /নামের বানান মিলিয়ে/, 'no spelling advice');
  assert.doesNotMatch(js, /সিঙ্ক সম্পন্ন করুন|সিঙ্ক চালু করুন/, 'no cross-device sync instructions');
  assert.ok(js.includes("setAuthMessage('অ্যাকাউন্ট পাওয়া যায়নি।');"), 'the one short not-found message');
});

test('different failures keep their own messages', () => {
  const js = read('js/login.js');
  assert.match(js, /একাধিক শিক্ষার্থী পাওয়া গেছে/, 'ambiguous short ID still explains itself');
  assert.match(js, /অথবা পাসওয়ার্ড সঠিক নয়/, 'a wrong password is still a wrong password');
  assert.match(js, /ক্লাউড থেকে অ্যাকাউন্ট আনা যায়নি/, 'an unchecked cloud is still a sync failure, not a missing account');
});
