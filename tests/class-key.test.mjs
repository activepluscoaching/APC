import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeClassId,
  normalizeSectionId,
  classKeyOf,
  withClassKey,
  matchesClassSection
} from '../js/class-key.js';
import { matchesStudent } from '../js/teaching-data.js';
import { examMatchesStudent } from '../js/exam-data.js';
import { noticeScopeMatches } from '../js/notification-rules.js';

test('normalizeClassId unifies Bengali class names, Academic IDs and aliases', () => {
  assert.equal(normalizeClassId('একাদশ শ্রেণি'), 'একাদশ শ্রেণি');
  assert.equal(normalizeClassId('CLASS-একাদশ-শ্রেণি'), 'একাদশ শ্রেণি');
  assert.equal(normalizeClassId('hsc-1'), 'একাদশ শ্রেণি');
  assert.equal(normalizeClassId({ class: 'দশম শ্রেণি' }), 'দশম শ্রেণি');
  assert.equal(normalizeClassId({ targetClass: 'দশম শ্রেণি' }), 'দশম শ্রেণি');
  assert.equal(normalizeClassId('সব শ্রেণি'), '');
  assert.equal(normalizeClassId('all'), '');
});

test('normalizeSectionId unifies বিজ্ঞান and বিজ্ঞান বিভাগ and English section aliases', () => {
  assert.equal(normalizeSectionId('বিজ্ঞান'), 'বিজ্ঞান');
  assert.equal(normalizeSectionId('বিজ্ঞান বিভাগ'), 'বিজ্ঞান');
  assert.equal(normalizeSectionId('বিজ্ঞান শাখা'), 'বিজ্ঞান');
  assert.equal(normalizeSectionId('science'), 'বিজ্ঞান');
  assert.equal(normalizeSectionId('মানবিক বিভাগ'), 'মানবিক');
  assert.equal(normalizeSectionId('ব্যবসায় শিক্ষা বিভাগ'), 'ব্যবসায় শিক্ষা');
  assert.equal(normalizeSectionId('সকল বিভাগ'), '');
  assert.equal(normalizeSectionId('সব বিভাগ'), '');
  assert.equal(normalizeSectionId(''), '');
});

test('withClassKey stamps classId and sectionId while preserving legacy fields', () => {
  const stamped = withClassKey({ className: 'একাদশ শ্রেণি', group: 'বিজ্ঞান বিভাগ' });
  assert.equal(stamped.classId, 'একাদশ শ্রেণি');
  assert.equal(stamped.sectionId, 'বিজ্ঞান');
  assert.equal(stamped.className, 'একাদশ শ্রেণি');
  assert.equal(stamped.group, 'বিজ্ঞান বিভাগ');
  assert.deepEqual(classKeyOf({ class: 'দশম শ্রেণি', section: 'মানবিক শাখা' }), {
    classId: 'দশম শ্রেণি',
    sectionId: 'মানবিক'
  });
});

test('migration rule: class with no section matches all sections of that class; specific section filters strictly', () => {
  const sciStudent = { className: 'একাদশ শ্রেণি', group: 'বিজ্ঞান বিভাগ' };
  const artsStudent = { className: 'একাদশ শ্রেণি', group: 'মানবিক' };
  const tenthStudent = { className: 'দশম শ্রেণি', group: 'বিজ্ঞান' };

  const allSectionItem = { class: 'একাদশ শ্রেণি', section: '' };
  assert.equal(matchesClassSection(allSectionItem, sciStudent), true);
  assert.equal(matchesClassSection(allSectionItem, artsStudent), true);
  assert.equal(matchesClassSection(allSectionItem, tenthStudent), false);

  const sciItem = { className: 'একাদশ শ্রেণি', group: 'বিজ্ঞান' };
  assert.equal(matchesClassSection(sciItem, sciStudent), true);
  assert.equal(matchesClassSection(sciItem, artsStudent), false);
  assert.equal(matchesClassSection(sciItem, tenthStudent), false);

  assert.equal(matchesStudent(sciItem, sciStudent), true);
  assert.equal(matchesStudent(sciItem, artsStudent), false);
  assert.equal(examMatchesStudent(sciItem, sciStudent), true);
  assert.equal(examMatchesStudent(sciItem, artsStudent), false);
  assert.equal(noticeScopeMatches({ targetClass: 'একাদশ শ্রেণি', targetGroup: 'বিজ্ঞান বিভাগ' }, sciStudent), true);
  assert.equal(noticeScopeMatches({ targetClass: 'একাদশ শ্রেণি', targetGroup: 'বিজ্ঞান বিভাগ' }, artsStudent), false);
});
