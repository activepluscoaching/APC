/* Academic structure — the single source of truth (Admin Academic Setup).
   The migration must adopt everything an older device already has, and
   deactivating a row must never touch historical records. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import {
  ACADEMICS_KEY, loadAcademics, saveClass, saveSubject, setClassActive, setSubjectActive,
  setClassSubjectByName, listClasses, listSubjects, listMappings, subjectsForClass,
  isSubjectEnabled, classByName, subjectByName, classNames, classesForSubject,
  classCodeFor, subjectCodeFor, academicCodes, listChapters, listChaptersForSubject,
  chapterByName, chapterById, saveChapter, setChapterActive, ensureChapter
} from '../js/academics.js';
import { KEYS } from '../js/database.js';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';

let ctx;
const store = () => ctx.window.localStorage;
const stored = () => JSON.parse(store().getItem(ACADEMICS_KEY));

before(async () => {
  ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  await provisionStaff('admin');
  seedStaffSession(ctx.window, 'admin');
});

test('the first read seeds every class the app already ships, with subjects per class', async () => {
  const db = loadAcademics();
  assert.equal(db.version, 2);
  /* Every class and subject carries its permanent code from the first read. */
  assert.equal(classCodeFor('দশম শ্রেণি'), '10');
  assert.equal(classCodeFor('অষ্টম শ্রেণি'), '08');
  assert.equal(subjectCodeFor('বাংলা'), 'BN');
  assert.equal(subjectCodeFor('ইংরেজি'), 'EN');
  assert.equal(subjectCodeFor('গণিত'), 'MT');
  assert.equal(subjectCodeFor('বিজ্ঞান'), 'SC');
  assert.equal(subjectCodeFor('আইসিটি'), 'ICT');
  assert.equal(new Set(listSubjects().map(item => item.code)).size, listSubjects().length, 'no two subjects share a code');
  assert.equal(new Set(listClasses().map(item => item.code)).size, listClasses().length, 'no two classes share a code');
  assert.deepEqual(classNames(), ['অষ্টম শ্রেণি', 'নবম শ্রেণি', 'দশম শ্রেণি', 'একাদশ শ্রেণি', 'দ্বাদশ শ্রেণি', 'ডিগ্রি ১ম বর্ষ', 'ডিগ্রি ২য় বর্ষ', 'ডিগ্রি ৩য় বর্ষ', 'অনার্স ১ম বর্ষ', 'অনার্স ২য় বর্ষ', 'অনার্স ৩য় বর্ষ', 'অনার্স ৪র্থ বর্ষ']);
  assert.ok(subjectsForClass('অষ্টম শ্রেণি').some(item => item.name === 'গণিত'));
  assert.ok(subjectsForClass('দশম শ্রেণি').some(item => item.name === 'রসায়ন'), 'a science class runs science subjects');
  assert.equal(isSubjectEnabled('অষ্টম শ্রেণি', 'গণিত'), true);
  assert.equal(isSubjectEnabled('সপ্তম শ্রেণি', 'গণিত'), false, 'a class the app does not run has no subjects');
  /* Seeding runs once: a second read leaves the file byte-identical. */
  const before = store().getItem(ACADEMICS_KEY);
  loadAcademics();
  assert.equal(store().getItem(ACADEMICS_KEY), before);
});

test('a code is written once and survives a rename; chapters belong to class+subject', async () => {
  const mathsCode = subjectCodeFor('গণিত');
  await saveSubject({ id: subjectByName('গণিত').id, name: 'গণিত (সাধারণ)' });
  assert.equal(subjectCodeFor('গণিত (সাধারণ)'), mathsCode, 'renaming a subject kept its code');
  assert.equal(stored().subjects.filter(item => item.code === mathsCode).length, 1, 'the code is not duplicated');
  await saveChapter({ className: 'দশম শ্রেণি', subjectName: 'গণিত (সাধারণ)', name: 'অধ্যায় ১' });
  await saveChapter({ className: 'দশম শ্রেণি', subjectName: 'গণিত (সাধারণ)', name: 'অধ্যায় ২' });
  await saveChapter({ className: 'দশম শ্রেণি', subjectName: 'ইংরেজি', name: 'Chapter 1' });
  const chapters = listChapters('দশম শ্রেণি', 'গণিত (সাধারণ)');
  assert.deepEqual(chapters.map(item => item.name), ['অধ্যায় ১', 'অধ্যায় ২']);
  assert.equal(listChapters('দশম শ্রেণি', 'ইংরেজি').map(item => item.name).join(), 'Chapter 1', 'chapters never leak between subjects');
  await assert.rejects(() => saveChapter({ className: 'দশম শ্রেণি', subjectName: 'গণিত (সাধারণ)', name: 'অধ্যায় ১' }), /আগেই আছে/);
  /* Switching a chapter off hides it from new pickers only. */
  await setChapterActive(chapters[0].id, false);
  assert.deepEqual(listChapters('দশম শ্রেণি', 'গণিত (সাধারণ)').map(item => item.name), ['অধ্যায় ২']);
  assert.equal(listChapters('দশম শ্রেণি', 'গণিত (সাধারণ)', { includeInactive: true }).length, 2);
  assert.equal(chapterById(chapters[0].id).name, 'অধ্যায় ১', 'history keeps its chapter');
  await setChapterActive(chapters[0].id, true);
  const found = await ensureChapter('দশম শ্রেণি', 'গণিত (সাধারণ)', 'অধ্যায় ১');
  assert.equal(found.id, chapters[0].id, 'ensureChapter finds the existing row instead of duplicating');
  assert.equal(listChaptersForSubject('গণিত (সাধারণ)').length, 2);
  await saveSubject({ id: subjectByName('গণিত (সাধারণ)').id, name: 'গণিত' });
  assert.deepEqual(academicCodes('দশম শ্রেণি', 'গণিত'), { classCode: '10', subjectCode: mathsCode });
});

test('chapters another copy already stored (course library) are adopted', async () => {
  store().setItem(KEYS.courseContent, JSON.stringify({ version: 1, records: [
    { id: 'CONTENT-0001', type: 'chapter', classId: classByName('অষ্টম শ্রেণি').id, subjectId: subjectByName('বিজ্ঞান').id, title: 'অধ্যায় ৩', createdAt: '2026-09-01T00:00:00.000Z' }
  ] }));
  loadAcademics();
  assert.equal(chapterByName('অষ্টম শ্রেণি', 'বিজ্ঞান', 'অধ্যায় ৩')?.name, 'অধ্যায় ৩');
});

test('existing assignments, exams and teaching subjects are adopted, never dropped', async () => {
  store().setItem('activePlus.manager.teacherAssignments.v1', JSON.stringify([
    { id: 'TAS-1', teacherUsername: 'teacher.apc', teacherName: 'T', className: 'ডিগ্রি ১ম বর্ষ', group: '', subject: 'উচ্চতর গণিত' }
  ]));
  store().setItem(KEYS.exams, JSON.stringify({ version: 1, exams: [{ id: 'E1', className: 'নবম শ্রেণি', subject: 'বাংলা', questions: [] }], attempts: [] }));
  store().setItem(KEYS.teaching, JSON.stringify({ version: 1, activities: [{ id: 'A1', className: 'অষ্টম শ্রেণি', subject: 'আইসিটি' }] }));
  loadAcademics();
  assert.equal(isSubjectEnabled('ডিগ্রি ১ম বর্ষ', 'উচ্চতর গণিত'), true, 'the assignment subject is usable');
  assert.equal(isSubjectEnabled('নবম শ্রেণি', 'বাংলা'), true);
  assert.equal(isSubjectEnabled('অষ্টম শ্রেণি', 'আইসিটি'), true);
  assert.equal(JSON.parse(store().getItem('activePlus.manager.teacherAssignments.v1'))[0].subject, 'উচ্চতর গণিত', 'the old record is left exactly as it was');
});

const mappingCount = () => stored().mappings.filter(item => item.classId && item.subjectId).length;

test('Admin creates classes and subjects; duplicates are refused', async () => {
  await saveClass({ name: 'সপ্তম শ্রেণি' });
  assert.ok(classByName('সপ্তম শ্রেণি'));
  await assert.rejects(saveClass({ name: 'সপ্তম শ্রেণি' }), /আগেই আছে/);
  await saveSubject({ name: 'কৃষিশিক্ষা' });
  assert.ok(subjectByName('কৃষিশিক্ষা'));
  await assert.rejects(saveSubject({ name: 'কৃষিশিক্ষা' }), /আগেই আছে/);
  const before = mappingCount();
  await setClassSubjectByName('সপ্তম শ্রেণি', 'কৃষিশিক্ষা', true);
  assert.equal(mappingCount(), before + 1);
  await setClassSubjectByName('সপ্তম শ্রেণি', 'কৃষিশিক্ষা', true);
  assert.equal(mappingCount(), before + 1, 'the same pair never duplicates');
  assert.equal(isSubjectEnabled('সপ্তম শ্রেণি', 'কৃষিশিক্ষা'), true);
  await setClassSubjectByName('সপ্তম শ্রেণি', 'কৃষিশিক্ষা', false);
  assert.equal(isSubjectEnabled('সপ্তম শ্রেণি', 'কৃষিশিক্ষা'), false);
  assert.equal(mappingCount(), before + 1, 'turning it off keeps the row for history');
  assert.equal(listMappings({ includeInactive: true }).some(item => item.active === false), true,
    'the row stays stored, only switched off');
});

test('a subject switched off disappears from new pickers but old records stay', async () => {
  store().setItem(KEYS.exams, JSON.stringify({ version: 1, exams: [{ id: 'E-OLD', className: 'দশম শ্রেণি', subject: 'রসায়ন', status: 'published', questions: [{ id: 'q1' }] }], attempts: [] }));
  const chemistry = subjectByName('রসায়ন');
  await setSubjectActive(chemistry.id, false);
  assert.equal(isSubjectEnabled('দশম শ্রেণি', 'রসায়ন'), false, 'no new exam/routine can pick it');
  assert.equal(JSON.parse(store().getItem(KEYS.exams)).exams[0].subject, 'রসায়ন', 'the historical exam is untouched');
  await setSubjectActive(chemistry.id, true);
  assert.equal(isSubjectEnabled('দশম শ্রেণি', 'রসায়ন'), true);
});

test('a deactivated class leaves its exams, results and assignments alone', async () => {
  const tenth = classByName('দশম শ্রেণি');
  await setClassActive(tenth.id, false);
  assert.equal(classNames().includes('দশম শ্রেণি'), false, 'hidden from new pickers');
  assert.equal(classNames({ includeInactive: true }).includes('দশম শ্রেণি'), true, 'still stored, restorable');
  assert.ok(classByName('দশম শ্রেণি'), 'lookups keep resolving old records');
  assert.ok(subjectsForClass('দশম শ্রেণি').length > 0, 'its subject mapping survives');
  await setClassActive(tenth.id, true);
  assert.equal(classNames().includes('দশম শ্রেণি'), true);
});

test('the structure answers the questions every cascading picker asks', async () => {
  assert.equal(isSubjectEnabled('দশম শ্রেণি', 'গণিত'), true);
  assert.equal(classesForSubject('গণিত').some(item => item.name === 'দশম শ্রেণি'), true);
  assert.ok(listClasses({ includeInactive: true }).length >= listClasses().length);
  assert.ok(listSubjects().length > 0);
  assert.ok(listMappings().length > 0);
});

test('only a signed-in Admin can change the structure', async () => {
  ctx.window.localStorage.removeItem(STAFF_ACCOUNTS.admin.sessionKey);
  ctx.window.sessionStorage.clear();
  await assert.rejects(saveClass({ name: 'নতুন শ্রেণি' }), /Admin/);
  await assert.rejects(saveSubject({ name: 'নতুন বিষয়' }), /Admin/);
  await assert.rejects(setClassSubjectByName('নবম শ্রেণি', 'গণিত', false), /Admin/);
  assert.ok(loadAcademics().classes.length > 0);
  seedStaffSession(ctx.window, 'admin');
});

after(() => ctx?.window.close());
