import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { guardianDraft } from '../js/guardian-message.js';
test('draft URL is WhatsApp-only; no sending and no unsafe phone', () => {
  const url = guardianDraft({ name: 'রহিম', guardianMobile: '০১৭১২৩৪৫৬৭৮' }, 'due', 451);
  assert.match(url, /^https:\/\/wa\.me\/8801712345678\?text=/);
  assert.match(decodeURIComponent(url), /৳451/);
  assert.throws(() => guardianDraft({ guardianMobile: 'invalid' }, 'absence'));
});
