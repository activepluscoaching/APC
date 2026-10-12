/* The MCQ question paper's two-column layout (school request, 2026-09-30):
   an exam paper runs the questions down the left column and then the right one,
   each question keeps its own A/B/C/D options (the letters the student sees in
   the app), and a question is never split from its options at a column break.
   The canvas drawing itself is exercised in the browser specs; these tests pin
   the rules that decide the layout, plus the paper's heading. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { optionLetter, columnAdvance } from '../js/exam-pdf.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const TOP = 300, BOTTOM = 1600;   // a column of 1300 units

test('options use the same letters as the app', () => {
  assert.deepEqual([0, 1, 2, 3].map(optionLetter), ['A', 'B', 'C', 'D']);
  assert.equal(optionLetter(4), 'E', 'a fifth option still gets its own letter');
  const studentApp = read('js/student-exams.js');
  assert.match(studentApp, /'ABCD'\[j\]/, 'the on-screen exam labels options A–D');
  assert.match(read('js/exam-pdf.js'), /optionLetter\(/, 'the printed paper uses the same letters');
});

test('a question that fits goes in the current column', () => {
  assert.equal(columnAdvance({ y: TOP, top: TOP, bottom: BOTTOM, blockHeight: 200 }), 'stay');
  assert.equal(columnAdvance({ y: 1400, top: TOP, bottom: BOTTOM, blockHeight: 200 }), 'stay', 'exactly fits');
});

test('a question that would be cut moves to the next column with its options', () => {
  assert.equal(columnAdvance({ y: 1450, top: TOP, bottom: BOTTOM, blockHeight: 300 }), 'next-column');
  assert.equal(columnAdvance({ y: 1599, top: TOP, bottom: BOTTOM, blockHeight: 40 }), 'next-column');
});

test('a question taller than a whole column continues instead of looping', () => {
  assert.equal(columnAdvance({ y: 900, top: TOP, bottom: BOTTOM, blockHeight: 1400 }), 'stay');
});

test('the paper names the exam and only MCQ papers use two columns', () => {
  const source = read('js/exam-pdf.js');
  assert.match(source, /পরীক্ষার নাম: \$\{exam\.title\}/, 'the heading reads পরীক্ষার নাম: <title>');
  assert.match(source, /columnMode = exam\.type === 'mcq'/, 'written papers keep the full width');
  assert.match(source, /colIndex = 1/, 'the flow moves to the right column');
});
