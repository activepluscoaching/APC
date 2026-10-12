/* Exam identity + paper order: the rules that make a paper traceable
   (permanent Exam Code) and fair (the same student always resumes the same
   paper, while answers stay bound to option ids, never to A/B/C/D positions). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateExamCode, ensureExamCode, examCodeFor, examCodeParts, highestExamSerial,
  orderPaperForAttempt, attemptOptionOrder, attemptQuestions, attemptOrderSeed,
  seededShuffle, nextSequentialId, timeLabel, examTypePrefix, safeCodePart, examCodeYear
} from '../js/exam-core.js';

const at = value => Date.parse(value);
const paper = (questions = 6) => ({
  id: 'E-1', type: 'mcq', code: 'M2608BN01',
  questions: Array.from({ length: questions }, (_, index) => ({
    id: `q${index + 1}`,
    options: [{ id: 'A', text: 'ক' }, { id: 'B', text: 'খ' }, { id: 'C', text: 'গ' }, { id: 'D', text: 'ঘ' }]
  }))
});

test('the exam code is type + year + class + subject + serial, exactly as printed', () => {
  const scope = { type: 'mcq', startAt: at('2026-08-10T09:00:00+06:00'), classCode: '08', subjectCode: 'BN' };
  assert.equal(examCodeFor({ ...scope, serial: 1 }), 'M2608BN01');
  assert.equal(examCodeFor({ ...scope, serial: 12 }), 'M2608BN12');
  assert.equal(examCodeFor({ ...scope, type: 'short', serial: 3 }), 'S2608BN03');
  assert.equal(examCodeFor({ ...scope, type: 'written', serial: 3 }), 'R2608BN03');
  assert.equal(examCodeFor({ type: 'short', startAt: at('2026-08-10T09:00:00+06:00'), classCode: '10', subjectCode: 'ICT', serial: 2 }), 'S2610ICT02');
  assert.equal(examTypePrefix('written'), 'R');
  assert.equal(examTypePrefix('unknown-type'), 'X', 'an unknown type still yields a printable code');
  assert.equal(examCodeYear(at('2026-01-01T00:00:00+06:00')), '26');
  assert.equal(safeCodePart('ict'), 'ICT');
  assert.equal(safeCodePart('', 'XX'), 'XX');
});

test('serials are scoped to type+year+class+subject and never collide', () => {
  const first = allocateExamCode([], { type: 'mcq', startAt: at('2026-08-10T09:00:00+06:00'), classCode: '08', subjectCode: 'BN' });
  assert.deepEqual({ code: first.code, serial: first.serial }, { code: 'M2608BN01', serial: 1 });
  const exams = [{ id: 'E1', type: 'mcq', code: 'M2608BN01' }, { id: 'E2', type: 'mcq', code: 'M2608BN02' }];
  assert.equal(highestExamSerial(exams, { prefix: 'M', year: '26', classCode: '08', subjectCode: 'BN' }), 2);
  assert.equal(allocateExamCode(exams, { type: 'mcq', startAt: at('2026-08-11T09:00:00+06:00'), classCode: '08', subjectCode: 'BN' }).code, 'M2608BN03');
  assert.equal(allocateExamCode(exams, { type: 'mcq', startAt: at('2026-08-11T09:00:00+06:00'), classCode: '10', subjectCode: 'BN' }).code, 'M2610BN01', 'another class starts its own serial');
  assert.equal(allocateExamCode(exams, { type: 'short', startAt: at('2026-08-11T09:00:00+06:00'), classCode: '08', subjectCode: 'BN' }).code, 'S2608BN01', 'another exam type starts its own serial');
  assert.equal(allocateExamCode(exams, { type: 'mcq', startAt: at('2027-01-05T09:00:00+06:00'), classCode: '08', subjectCode: 'BN' }).code, 'M2708BN01', 'a new year starts its own serial');
  /* A deleted paper's code is not handed out twice: the serial walks forward. */
  const gaps = [{ id: 'E3', type: 'mcq', code: 'M2608BN01' }, { id: 'E4', type: 'mcq', code: 'M2608BN03' }];
  assert.equal(allocateExamCode(gaps, { type: 'mcq', startAt: at('2026-08-11T09:00:00+06:00'), classCode: '08', subjectCode: 'BN' }).code, 'M2608BN04');
});

test('a code is written once; a rescheduled or renamed paper keeps it', () => {
  const exams = [{ id: 'E1', type: 'mcq', code: 'M2608BN01', startAt: at('2026-08-10T09:00:00+06:00') }];
  const kept = ensureExamCode(exams, { ...exams[0], className: 'দশম শ্রেণি', subject: 'ইংরেজি', startAt: at('2026-09-01T09:00:00+06:00') });
  assert.equal(kept.code, 'M2608BN01');
  assert.equal(kept.allocated, false);
  const fresh = ensureExamCode(exams, { id: 'E2', type: 'mcq', startAt: at('2026-08-12T09:00:00+06:00'), className: 'দশম শ্রেণি', subject: 'বাংলা', classCode: '10', subjectCode: 'BN' });
  assert.deepEqual({ code: fresh.code, allocated: true }, { code: 'M2610BN01', allocated: true });
  const parts = examCodeParts('M2610ICT12');
  assert.deepEqual(parts, { raw: 'M2610ICT12', prefix: 'M', year: '26', classCode: '10', subjectCode: 'ICT', serial: 12 });
  assert.equal(examCodeParts('S2608S0103').subjectCode, 'S01', 'a generated subject code is read back whole');
  assert.equal(examCodeParts('not-a-code').serial, 0);
});

test('the seeded paper order is stable for one attempt and independent per student', () => {
  const exam = paper(6);
  assert.equal(attemptOrderSeed(exam, 'STU-1', 'A-1'), attemptOrderSeed(exam, 'STU-1', 'A-1'));
  const first = orderPaperForAttempt(exam, 'STU-1', 'A-1');
  const again = orderPaperForAttempt(exam, 'STU-1', 'A-1');
  assert.deepEqual(again, first, 'a resume on another device re-renders the same paper');
  const other = orderPaperForAttempt(exam, 'STU-2', 'A-2');
  assert.notDeepEqual(other, first, 'two students do not read the same order');
  for (const row of first) {
    assert.equal(row.options.length, 4);
    assert.deepEqual([...row.options].sort(), ['A', 'B', 'C', 'D'], 'every option id survives: the answer is stored by id, not by position');
  }
  assert.deepEqual([...first.map(row => row.id)].sort(), [...exam.questions.map(q => q.id)].sort());
  assert.deepEqual(seededShuffle([1, 2, 3, 4, 5], 'x'), seededShuffle([1, 2, 3, 4, 5], 'x'));
  assert.notDeepEqual(seededShuffle([1, 2, 3, 4, 5], 'x'), seededShuffle([1, 2, 3, 4, 5], 'y'));
});

test('fixed order keeps the teacher’s sequence; the attempt still records it', () => {
  const exam = { ...paper(4), questionOrder: 'fixed', optionOrder: 'fixed' };
  const order = orderPaperForAttempt(exam, 'STU-9', 'A-9');
  assert.deepEqual(order.map(row => row.id), ['q1', 'q2', 'q3', 'q4']);
  for (const row of order) assert.deepEqual(row.options, ['A', 'B', 'C', 'D']);
  assert.deepEqual(attemptQuestions(exam, { order }).map(q => q.id), ['q1', 'q2', 'q3', 'q4']);
  assert.deepEqual(attemptOptionOrder({ order }, 'q2'), ['A', 'B', 'C', 'D']);
  assert.equal(attemptOptionOrder({ order }, 'q9'), null);
  /* An attempt whose order is missing a question still renders every question. */
  const questions = attemptQuestions(exam, { order: order.slice(0, 2) });
  assert.deepEqual(questions.map(q => q.id), ['q1', 'q2', 'q3', 'q4']);
});

test('sequence ids and clock labels', () => {
  assert.equal(nextSequentialId('QUESTION', []), 'QUESTION-0001');
  assert.equal(nextSequentialId('QUESTION', [{ id: 'QUESTION-0001' }, { id: 'QUESTION-0007' }, { id: 'junk' }]), 'QUESTION-0008');
  assert.equal(timeLabel(Date.parse('2026-08-10T14:05:00+06:00')), '14:05');
  assert.equal(timeLabel('nope'), '');
});
