/* Tracking a student by the permanent Student ID — the same rule for the
   Admin panel, the Manager panel, the Cash Counter and the Teacher panel. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesStudentQuery, searchStudentsByQuery, searchText, latinDigits, studentLabel } from '../js/student-search.js';

const rakib = {
  id: 's260929001-abcdef0123456789', name: 'রাকিব হাসান', nameEn: 'Rakib Hasan',
  fatherName: 'আব্দুল হাসান', className: 'নবম শ্রেণি', group: 'বিজ্ঞান',
  mobile: '01755556666', guardianMobile: '01855556666', status: 'approved'
};
const raisa = {
  id: 's260929002-fedcba9876543210', name: 'রাইসা আক্তার', nameEn: 'Raisa Akter',
  fatherName: 'কামাল উদ্দিন', className: 'দশম শ্রেণি', group: 'মানবিক',
  mobile: '01911223344', guardianMobile: '01711998877', status: 'pending'
};
const roster = [rakib, raisa];

test('the permanent Student ID finds the student in every form staff may type', () => {
  const full = 's260929001-abcdef0123456789';
  for (const query of [
    full, full.toUpperCase(), 's260929001', 'S260929001',
    '260929001',                       // without the leading letter
    's260929001-abcdef',               // a long prefix
    's 2609 2900 1',                   // spaces inside
    latinDigits('২৬০৯২৯০০১')           // Bangla digits, converted first
  ]) {
    const found = searchStudentsByQuery(roster, query);
    assert.equal(found.length, 1, `query “${query}”`);
    assert.equal(found[0].id, rakib.id);
  }
});

test('a Bangla-digit Student ID typed by staff finds the student', () => {
  // "২৬০৯২৯০০১" is how the same id looks on a Bangla keyboard.
  assert.deepEqual(searchStudentsByQuery(roster, '২৬০৯২৯০০১').map(s => s.name), ['রাকিব হাসান']);
  assert.deepEqual(searchStudentsByQuery(roster, '০১৭৫৫৫৫৬৬৬৬').map(s => s.name), ['রাকিব হাসান'], 'Bangla mobile number');
});

test('name, guardian name, mobiles, class and group still work in one box', () => {
  assert.deepEqual(searchStudentsByQuery(roster, 'রাইসা').map(s => s.id), [raisa.id]);
  assert.deepEqual(searchStudentsByQuery(roster, 'RAKIB').map(s => s.id), [rakib.id]);
  assert.deepEqual(searchStudentsByQuery(roster, 'কামাল').map(s => s.id), [raisa.id], 'guardian name');
  assert.deepEqual(searchStudentsByQuery(roster, '01755556666').map(s => s.id), [rakib.id]);
  assert.deepEqual(searchStudentsByQuery(roster, '01711998877').map(s => s.id), [raisa.id], 'guardian mobile');
  assert.deepEqual(searchStudentsByQuery(roster, 'নবম').map(s => s.id), [rakib.id], 'class');
  assert.deepEqual(searchStudentsByQuery(roster, 'বিজ্ঞান').map(s => s.id), [rakib.id], 'group');
});

test('a short Student ID is a prefix search, so it is never a wildcard', () => {
  assert.equal(searchStudentsByQuery(roster, 's260929').length, 2, 'both students share the date part');
  assert.deepEqual(searchStudentsByQuery(roster, 's260929002').map(s => s.id), [raisa.id]);
  assert.deepEqual(searchStudentsByQuery(roster, 's260929009'), [], 'an unused id finds nobody');
  assert.deepEqual(searchStudentsByQuery(roster, ''), [], 'an empty query lists nobody');
  assert.deepEqual(searchStudentsByQuery(roster, '   '), []);
  assert.deepEqual(searchStudentsByQuery(null, 's260929001'), []);
});

test('the matching rules are stable helpers other modules can rely on', () => {
  assert.equal(matchesStudentQuery(rakib, 's260929001'), true);
  assert.equal(matchesStudentQuery(rakib, 'raisa'), false);
  assert.equal(matchesStudentQuery(null, 's260929001'), false);
  assert.equal(latinDigits('০১৭'), '017');
  assert.equal(searchText('  AP-1024  '), 'ap-1024');
  assert.equal(studentLabel(rakib), 'রাকিব হাসান (s260929001-abcdef0123456789)', 'staff always see the id with the name');
  assert.equal(studentLabel(null), '');
});
