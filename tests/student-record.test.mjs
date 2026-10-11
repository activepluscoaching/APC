import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { studentRecordMarkup } from '../js/student-record.js';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { ROSTER_KEY } from '../js/office-data.js';

const student = {
  id: 's260929001-7555167e8e66bc55', name: 'রায়হান আহমেদ', nameEn: 'Raihan Ahmed',
  fatherName: 'আবদুল করিম', className: 'অষ্টম শ্রেণি', group: 'প্রযোজ্য নয়',
  mobile: '01700000000', guardianMobile: '01800000000', address: 'ঢাকা, বাংলাদেশ',
  enrolledAt: '২৯/৯/২০২৬', lastActive: 'এই ডিভাইস', status: 'approved', attendance: 0, average: 85
};
const documentFor = data => new JSDOM(studentRecordMarkup(data)).window.document;

test('student details have full-width IDs, semantic sections and complete values', () => {
  const document = documentFor(student);
  assert.deepEqual([...document.querySelectorAll('h3')].map(el => el.textContent), [
    'ব্যক্তিগত তথ্য', 'যোগাযোগ', 'ভর্তি ও একাডেমিক তথ্য'
  ]);
  assert.equal(document.querySelector('.student-record-identifiers code').textContent, student.id);
  assert.equal(document.querySelectorAll('.student-record-identifiers code')[1].textContent, 'AUD-STU-s2609290017555167e8e66bc55');
  const fields = Object.fromEntries([...document.querySelectorAll('.student-record-field')].map(el => [
    el.querySelector('dt').textContent, el.querySelector('dd').textContent
  ]));
  assert.equal(fields['মোবাইল নম্বর'], '০১৭০০০০০০০০');
  assert.equal(fields['অভিভাবকের মোবাইল'], '০১৮০০০০০০০০');
  assert.equal(fields['নাম (English)'], student.nameEn);
  assert.equal(fields['ঠিকানা'], student.address);
  assert.match(fields['অগ্রগতি'], /উপস্থিতি ০%/);
  assert.match(fields['অগ্রগতি'], /গড় ফলাফল ৮৫%/);
  assert.match(document.querySelector('.student-record-status').textContent, /অনুমোদিত/);
  assert.equal(document.querySelector('.student-record-content').tabIndex, 0);
  assert.equal(document.querySelector('.student-record-actions').closest('.student-record-content'), null, 'actions stay outside scrolling content');
});

test('record values are escaped; missing data and unknown status are explicit', () => {
  const hostile = '<img src=x onerror=alert(1)>';
  const document = documentFor({ id: hostile, name: hostile, nameEn: hostile, address: hostile });
  assert.equal(document.querySelector('img, script'), null);
  assert.equal(document.querySelector('code').textContent, hostile);
  assert.ok(document.querySelector('.student-record-fields').textContent.includes(hostile));
  assert.match(document.body.textContent, /তথ্য দেওয়া হয়নি/);
  assert.doesNotMatch(document.body.textContent, /undefined|null|NaN/);
  assert.match(document.querySelector('.student-record-status').textContent, /স্ট্যাটাস অজানা/);
  assert.match(document.body.textContent, /অনুমোদনের পরে দেখা যাবে/);
});

test('admin detail opens, closes and edits without changing data; layout variant resets', async t => {
  const ctx = await loadPage('admin.html', { seed: {
    'activePlus.demo.autofill.v1': 'off', [ROSTER_KEY]: JSON.stringify([student])
  } });
  t.after(() => ctx.window.close());
  await provisionStaff('admin');
  seedStaffSession(ctx.window, 'admin');
  await import('../js/admin.js');
  await ctx.waitFor(() => !ctx.$('#adminShell').hidden);
  await ctx.waitFor(() => Boolean(ctx.$('#studentList [data-action="view"]')));
  const stored = ctx.window.localStorage.getItem(ROSTER_KEY);
  ctx.click(ctx.$('#studentList [data-action="view"]'));
  assert.equal(ctx.$('#adminModalBackdrop').hidden, false);
  assert.ok(ctx.$('.student-record-modal'));
  assert.equal(ctx.$('#adminModalTitle').textContent, student.name);
  ctx.click(ctx.$('#adminModalClose'));
  assert.equal(ctx.$('#adminModalBackdrop').hidden, true);
  ctx.click(ctx.$('#studentList [data-action="view"]'));
  ctx.click(ctx.$('[data-modal-action="edit"]'));
  assert.ok(ctx.$('#studentEditForm'));
  assert.equal(ctx.$('.student-record-modal'), null, 'edit dialog does not inherit the scroll layout');
  assert.equal(ctx.$('#editStudentName').value, student.name);
  ctx.click(ctx.$('#adminModalClose'));
  ctx.click(ctx.$('#studentList [data-action="view"]'));
  ctx.click(ctx.$('[data-modal-action="reset-pin"]'));
  assert.equal(ctx.$('.student-record-modal'), null);
  assert.match(ctx.$('#adminModalTitle').textContent, /ডিফল্ট পাসওয়ার্ড/);
  assert.equal(ctx.window.localStorage.getItem(ROSTER_KEY), stored);
});

// The new renderer/style must also be available to an updated offline install.
test('student record assets are loaded by the design system and cached offline', () => {
  const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  assert.match(read('css/design-system.css'), /@import url\('\.\/student-record\.css'\)/);
  for (const asset of ['css/student-record.css', 'js/student-record.js']) {
    assert.ok(read('sw.js').includes("'./" + asset + "'"));
  }
});
