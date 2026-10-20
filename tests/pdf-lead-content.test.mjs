/* PDF lead content (owner request 2026-10-20): every generated PDF opens on
   its main content — no summary/identity wall at the start.

   Pinned here:
     • reports  — the dashboard-style summary tiles (and the heading that only
                  titles them) that sat BEFORE the first table/question list
                  are dropped at layout time; the branded header (institution,
                  title, period), mid/post-report tiles and tiles-only
                  documents are untouched;
     • exam     — the question paper starts with the brand header + bare exam
                  title + one class • subject line; the identity summary table
                  (drawIdentity) is gone; the footer still carries the paper
                  code and the page number;
     • material — the sheet shows the title and the detailed instructions only,
                  under the same brand header/footer; no meta summary lines. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage } from './jsdom-harness.mjs';

let engine;
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

before(async () => {
  const page = await loadPage('index.html');
  const CHAR = 8;
  const fake = {
    font: '', fillStyle: '', strokeStyle: '', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1,
    measureText: text => ({ width: String(text).length * CHAR }),
    fillText() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() {}, drawImage() {}, scale() {}, setTransform() {}
  };
  page.window.HTMLCanvasElement.prototype.getContext = () => fake;
  page.window.HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
    callback(new page.window.Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
  };
  page.window.Blob.prototype.arrayBuffer = function arrayBuffer() { return Promise.resolve(new Uint8Array([1, 2, 3]).buffer); };
  page.window.Image.prototype.decode = function decode() { return Promise.resolve(); };
  globalThis.FontFace = page.window.FontFace = class FontFace { load() { return Promise.resolve(this); } };
  Object.defineProperty(page.window.document, 'fonts', { value: { add() {} }, configurable: true });
  engine = await import('../js/report-layout.js');
});

const textsOf = pages => pages.flatMap(page => page.items.filter(item => item.kind === 'text').map(item => item.text));

test('a report opens on its table: leading summary tiles (and their heading) are gone', () => {
  const doc = engine.createReport({ title: 'ফি রিপোর্ট', period: 'অক্টোবর ২০২৬' });
  engine.addHeading(doc, 'পরীক্ষার সারাংশ');
  engine.addTiles(doc, [{ label: 'মোট আদায়', value: '৳৫,০০০' }, { label: 'বকেয়া', value: '৳১,২০০' }]);
  engine.addHeading(doc, 'মূল তালিকা');
  engine.addTable(doc, { columns: [{ label: 'নাম' }, { label: 'টাকা' }], rows: [['রাইসা', '৳৫০০']] });
  engine.addTiles(doc, [{ label: 'সর্বশেষ টাইল', value: '৯৯' }]);

  const { pages } = engine.layoutReport(doc, null);
  const texts = textsOf(pages);
  assert.ok(texts.includes('মোট আদায়') === false, 'the leading summary tiles are dropped');
  assert.ok(!texts.some(text => text.includes('পরীক্ষার সারাংশ')), 'the heading that only titled them goes too');
  assert.ok(texts.includes('মূল তালিকা'), 'the main table keeps its heading');
  assert.ok(texts.includes('রাইসা') && texts.includes('৳৫০০'), 'the main rows are printed');
  assert.ok(texts.includes('সর্বশেষ টাইল'), 'tiles AFTER the main content still render');
  assert.ok(texts.includes('ফি রিপোর্ট') && texts.includes('অক্টোবর ২০২৬'), 'the report header keeps title and date');
});

test('a tiles-only document still renders — the tiles are its content', () => {
  const doc = engine.createReport({ title: 'শুধু টাইল' });
  engine.addTiles(doc, [{ label: 'মোট', value: '৬০' }]);
  const { pages } = engine.layoutReport(doc, null);
  assert.ok(textsOf(pages).includes('৬০'), 'nothing would be left to show, so it is kept');
});

test('the exam paper starts on the bare title and keeps code + page in the footer', () => {
  const source = read('js/exam-pdf.js');
  assert.match(source, /await drawParagraph\(exam\.title, \{ bold: true/, 'the paper opens on exam.title');
  assert.match(source, /drawParagraph\(`\$\{exam\.className \|\| 'সব শ্রেণি'\} • \$\{exam\.subject\}/,
    'one scope line: class • subject');
  assert.doesNotMatch(source, /drawIdentity/, 'the identity summary table is gone');
  assert.doesNotMatch(source, /const identity = \[/, 'the identity array is gone');
  assert.match(source, /\} • \$\{code\} • \$\{BRAND_NAME\}/, 'the footer still carries the paper code');
  assert.match(source, /পৃষ্ঠা \$\{bn\(pageNo\)\}/, 'the footer still carries the page number');
});

test('the material sheet prints the title and instructions only, under the brand header', () => {
  const source = read('js/material-pdf.js');
  assert.match(source, /await line\(activity\.title \|\| type\.label, \{ bold: true, size: 30 \}\)/, 'the title line');
  assert.match(source, /section\('বিস্তারিত নির্দেশনা'\)/, 'the instructions section stays');
  assert.doesNotMatch(source, /বিষয়: \$\{activity\.subject\}/, 'no type • subject • class summary line');
  assert.doesNotMatch(source, /নির্ধারিত তারিখ|জমার শেষ সময়|স্থান: \$\{activity\.room\}|পূর্ণমান: \$\{bn\(activity\.totalMarks\)\}|শিক্ষক: \$\{activity\.teacherName\}/,
    'no date/place/marks/teacher meta summary under the title');
  assert.match(source, /Active Plus Coaching/, 'the brand header stays');
  assert.match(source, /পৃষ্ঠা \$\{bn\(pageNo\)\}/, 'the brand footer stays');
});
