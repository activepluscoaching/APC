/* The reports layout engine: one measured draw-list, two renderers.

   These tests prove the two things the Reports Module promises:
     1. a report flows onto as many A4 pages as it needs, and a table row or an
        MCQ question is never cut in half by a page break;
     2. the preview and the PDF are the SAME document — the PDF renderer draws
        exactly the items the preview renders, in the same order.

   jsdom has no canvas, so only the two cosmetic browser APIs the engine needs
   are stubbed: text measurement (a fixed advance per character) and the JPEG
   encoding of a drawn page. No app logic is replaced. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';

let engine;
let fake;
const drawn = [];

before(async () => {
  const page = await loadPage('index.html');
  const CHAR = 8; // one character of advance in the stubbed measurer
  fake = {
    font: '', fillStyle: '', strokeStyle: '', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1,
    measureText: text => ({ width: String(text).length * CHAR }),
    fillText: (text, x, y) => {
      const size = Number(/([\d.]+)px/.exec(fake.font)?.[1] || 0);
      drawn.push({ kind: 'text', text: String(text), x, y, size, font: fake.font, fill: fake.fillStyle, align: fake.textAlign });
    },
    fillRect: (x, y, w, h) => drawn.push({ kind: 'rect', x, y, w, h, fill: fake.fillStyle }),
    strokeRect() {}, beginPath() {}, moveTo: (x, y) => drawn.push({ kind: 'move', x, y }),
    lineTo: (x, y) => drawn.push({ kind: 'line', x, y }), stroke() {}, drawImage() {}, scale() {},
    setTransform() {}
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

/* ---------- helpers ---------- */

const textItems = pages => pages.flatMap(page => page.items.filter(item => item.kind === 'text').map(item => ({ ...item, page: page.index })));
const has = (pages, text) => textItems(pages).some(item => item.text === text);

function tableDoc(rows, columns = [{ label: 'কলাম ১', width: 1 }, { label: 'কলাম ২', width: 1 }]) {
  const doc = engine.createReport({ title: 'পরীক্ষা রিপোর্ট', period: 'সেপ্টেম্বর ২০২৬' });
  engine.addTable(doc, { columns, rows, title: 'টেবিল' });
  return doc;
}

/* ---------- 1. an empty report is still a proper page ---------- */

test('a report with no records still renders one complete page', () => {
  const doc = engine.createReport({ title: 'খালি রিপোর্ট', subtitle: 'কোনো তথ্য নেই' });
  const { pages, total } = engine.layoutReport(doc, null);
  assert.equal(total, 1);
  assert.equal(pages.length, 1);
  const html = engine.renderPreviewHTML(pages);
  assert.match(html, /class="rp-page"/);
  assert.ok(has(pages, 'Active Plus Coaching'), 'the brand header is on the page');
  assert.ok(has(pages, 'খালি রিপোর্ট'), 'the title is on the page');
  assert.ok(has(pages, 'পৃষ্ঠা ১'), 'the footer carries a page number');
});

/* ---------- 2. pagination ---------- */

test('a long table flows onto as many A4 pages as it needs', () => {
  const rows = Array.from({ length: 140 }, (_, index) => [`সারি ${index + 1}`, `মান ${index + 1}`]);
  const { pages, total } = engine.layoutReport(tableDoc(rows), null);
  assert.ok(total > 1, `expected more than one page, got ${total}`);
  // Every page is numbered, and the count on the last page matches.
  for (let index = 1; index <= total; index += 1) {
    const page = pages[index - 1];
    assert.equal(page.index, index);
    assert.ok(has([page], 'Active Plus Coaching'), `page ${index} keeps the header`);
    assert.ok(has([page], `পৃষ্ঠা ${'০১২৩৪৫৬৭৮৯'[index] || index}`) || has([page], `পৃষ্ঠা ${index}`), `page ${index} is numbered`);
  }
  // Nothing the report body draws lands outside the printable area (the
  // header and footer are the frame, drawn outside it on purpose).
  for (const page of pages) {
    const body = page.items.filter(item => item.kind === 'text' && item.y < 1060);
    const lowest = Math.max(...body.map(item => item.y));
    assert.ok(lowest <= engine.CONTENT.bottom, `page ${page.index} stays above the footer`);
  }
});

test('every page after the first repeats the table header row', () => {
  const rows = Array.from({ length: 140 }, (_, index) => [`সারি ${index + 1}`, `মান ${index + 1}`]);
  const { pages } = engine.layoutReport(tableDoc(rows), null);
  for (const page of pages) {
    assert.ok(has([page], 'কলাম ১') && has([page], 'কলাম ২'), `page ${page.index} repeats the column labels`);
  }
});

/* ---------- 3. a table row is never split across pages ---------- */

test('no table row is ever cut in half by a page break', () => {
  const rows = Array.from({ length: 140 }, (_, index) => [`R${index}C0`, `R${index}C1`]);
  const { pages } = engine.layoutReport(tableDoc(rows), null);
  const items = textItems(pages);
  for (let index = 0; index < rows.length; index += 1) {
    const cells = items.filter(item => [`R${index}C0`, `R${index}C1`].includes(item.text));
    assert.equal(cells.length, 2, `row ${index} is drawn once per column`);
    assert.equal(new Set(cells.map(cell => cell.page)).size, 1, `row ${index} stays on one page`);
    assert.equal(new Set(cells.map(cell => cell.y)).size, 1, `row ${index} sits on one line`);
  }
});

/* ---------- 4. an MCQ question is never split ---------- */

test('no MCQ question is ever cut in half by a page break', () => {
  const questions = Array.from({ length: 40 }, (_, index) => ({
    no: `প্রশ্ন ${index + 1}`,
    text: `প্রশ্নের বিবরণ ${index + 1} — বাংলাদেশের রাজধানীর নাম কী এবং কেন?`,
    options: [
      { id: 'A', text: `অপশন ক ${index + 1}` },
      { id: 'B', text: `অপশন খ ${index + 1}` },
      { id: 'C', text: `অপশন গ ${index + 1}` },
      { id: 'D', text: `অপশন ঘ ${index + 1}` }
    ],
    answer: 'B',
    answerText: 'খ',
    marks: '১',
    explanation: `ব্যাখ্যা ${index + 1}`
  }));
  const doc = engine.createReport({ title: 'সম্পূর্ণ প্রশ্নপত্র' });
  engine.addQuestions(doc, questions, { showAnswer: true, showStudent: false });
  const { pages, total } = engine.layoutReport(doc, null);
  assert.ok(total > 1, 'a full question paper runs onto several pages');
  const items = textItems(pages);
  for (let index = 0; index < questions.length; index += 1) {
    const number = index + 1;
    const cells = items.filter(item => item.text === `প্রশ্ন ${number}`
      || item.text.startsWith(`প্রশ্নের বিবরণ ${number} `)
      || item.text === `A. অপশন ক ${number}`
      || item.text === `D. অপশন ঘ ${number}`);
    assert.ok(cells.length >= 4, `question ${number} is drawn with its stem and options`);
    assert.equal(new Set(cells.map(cell => cell.page)).size, 1, `question ${number} stays on one page`);
  }
  // Every question, every option and every correct answer is actually printed.
  questions.forEach((question, index) => {
    assert.ok(has(pages, question.no), `${question.no} is printed`);
    for (const option of question.options) {
      assert.ok(has(pages, `${option.id}. ${option.text}`), `option ${option.id} of question ${index + 1} is printed`);
    }
    assert.ok(textItems(pages).some(item => item.text.includes('সঠিক উত্তর: খ')), 'the answer key is printed');
  });
});

/* ---------- 5. the preview and the PDF are the same document ---------- */

test('the PDF draws exactly the items the preview renders, in the same order', async () => {
  const rows = Array.from({ length: 60 }, (_, index) => [`R${index}C0`, `R${index}C1`]);
  const doc = tableDoc(rows);
  engine.addTiles(doc, [{ label: 'মোট', value: '৬০' }, { label: 'যোগ', value: '১২০' }], { perRow: 2 });
  engine.addKeyValues(doc, [['নাম', 'রাইসা'], ['শ্রেণি', 'দশম']], { columns: 2 });
  engine.addNote(doc, 'নোট: এখানে কোনো পাসওয়ার্ড নেই।');

  const { pages, total, html } = await engine.buildReport(doc);
  drawn.length = 0;
  const blob = await engine.renderPagesPDF(pages);

  const expected = pages.flatMap(page => page.items.filter(item => item.kind === 'text'));
  const pdfTexts = drawn.filter(item => item.kind === 'text');
  assert.equal(pdfTexts.length, expected.length, 'the PDF draws one string per previewed text item — no more, no less');
  assert.deepEqual(pdfTexts.map(item => item.text), expected.map(item => item.text), 'the same text, in the same order');
  // Same coordinates too: the two renderers share the measured layout.
  assert.deepEqual(pdfTexts.map(item => Math.round(item.x)), expected.map(item => Math.round(item.x)), 'the same x');
  // Same coordinates too: the canvas draws each line at its item y plus the
  // shared baseline offset, so the two renderers cannot drift apart.
  assert.deepEqual(
    pdfTexts.map(item => Math.round((item.y - item.size * engine.TEXT_BASELINE) * 100)),
    expected.map(item => Math.round(item.y * 100)),
    'the same y'
  );
  assert.ok(blob instanceof Blob && blob.type === 'application/pdf', 'a real PDF comes back');
  assert.ok(html.includes(`data-page="${total}"`), 'the preview renders every page');
  assert.ok(total > 1);
});

/* ---------- 6. the shared font is used by both renderers ---------- */

test('both renderers use the same Bengali report font', async () => {
  const doc = tableDoc([['এক', 'দুই']]);
  const { pages, html } = await engine.buildReport(doc);
  const fonts = new Set(Array.from(html.matchAll(/font:\s*\d+\s+[\d.]+px\/1\s+([^;]+);/g), match => match[1].trim()));
  assert.equal(fonts.size, 1, 'the preview declares one font');
  assert.equal([...fonts][0], 'ReceiptBangla');
  drawn.length = 0;
  await engine.renderPagesPDF(pages);
  const canvasFonts = new Set(drawn.filter(item => item.kind === 'text').map(item => item.font));
  assert.equal(canvasFonts.size > 0, true, 'the PDF drew text');
  for (const font of canvasFonts) assert.match(font, /ReceiptBangla/, 'the PDF uses the same font');
});

/* ---------- 7. a summary tile never clips its value ---------- */

test('a long figure inside a tile is fully drawn, never truncated', () => {
  const value = '৳১,২৩,৪৫,৬৭৮';
  const doc = engine.createReport({ title: 'টাইল পরীক্ষা' });
  engine.addTiles(doc, [{ label: 'মোট আদায় এই মাসে', value }], { perRow: 2 });
  const { pages } = engine.layoutReport(doc, null);
  const items = textItems(pages);
  const drawnValue = items.filter(item => item.text.startsWith('৳'));
  assert.equal(drawnValue.length, 1, 'the figure is drawn');
  assert.equal(drawnValue[0].text, value, 'the figure is complete');
});

/* ---------- 8. reportRows() mirrors what the table printed ---------- */

test('reportRows() lists the column labels and the rows in print order', () => {
  const doc = tableDoc([['ক', 'খ'], ['গ', 'ঘ']]);
  assert.deepEqual(engine.reportRows(doc), [
    ['কলাম ১', 'কলাম ২'],
    ['ক', 'খ'],
    ['গ', 'ঘ']
  ]);
});
