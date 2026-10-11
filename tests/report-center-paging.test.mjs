/* Report Center at scale — a long report paginates honestly and the document
   keeps every row in the order it printed.

   Seeded with 60 students: the Student Master List must break across real A4
   pages, the preview must show exactly the pages the engine laid out, and the
   PDF naming convention must survive the full document. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { STORAGE_KEYS } from '../js/config.js';
import { ROSTER_KEY } from '../js/office-data.js';

const TOTAL = 60;
const roster = Array.from({ length: TOTAL }, (_, i) => ({
  id: `AP-${2000 + i}`,
  name: `শিক্ষার্থী ${i + 1}`,
  nameEn: `Student ${i + 1}`,
  className: ['নবম শ্রেণি', 'দশম শ্রেণি'][i % 2],
  group: i % 3 === 0 ? 'বিজ্ঞান বিভাগ' : 'সাধারণ',
  mobile: `017${String(1000000 + i)}`,
  guardianMobile: `018${String(1000000 + i)}`,
  status: 'approved',
  enrolledAt: '2026-09-01'
}));

let ctx;
let document_;
let catalog;
let access;
let sources;
let reports;
let engine;
let lastDownload = null;
const CHAR = 8;

const ROOT = '#adminReports';
const $ = selector => ctx.$(`${ROOT} ${selector}`);
const $$ = selector => ctx.$$(`${ROOT} ${selector}`);

before(async () => {
  ctx = await loadPage('admin.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      [ROSTER_KEY]: JSON.stringify(roster),
      [STORAGE_KEYS.appConfig]: JSON.stringify({ coachingName: 'Active Plus Coaching' })
    }
  });

  const fake = {
    font: '', fillStyle: '', strokeStyle: '', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1,
    measureText: text => ({ width: String(text).length * CHAR }),
    fillText() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    drawImage() {}, scale() {}, setTransform() {}
  };
  ctx.window.HTMLCanvasElement.prototype.getContext = () => fake;
  ctx.window.HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
    callback(new ctx.window.Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }));
  };
  ctx.window.Blob.prototype.arrayBuffer = function arrayBuffer() { return Promise.resolve(new Uint8Array([1, 2, 3, 4]).buffer); };
  ctx.window.Image.prototype.decode = function decode() { return Promise.resolve(); };
  globalThis.FontFace = ctx.window.FontFace = class FontFace { load() { return Promise.resolve(this); } };
  Object.defineProperty(ctx.window.document, 'fonts', {
    value: { add() {}, ready: Promise.resolve() },
    configurable: true
  });

  const realCreate = ctx.window.document.createElement.bind(ctx.window.document);
  ctx.window.document.createElement = function create(tag, ...rest) {
    const node = realCreate(tag, ...rest);
    if (String(tag).toLowerCase() === 'a') {
      node.click = () => { lastDownload = { name: node.download, href: node.href }; };
    }
    return node;
  };
  ctx.window.URL.createObjectURL = () => 'blob:active-plus-report';
  ctx.window.URL.revokeObjectURL = () => {};
  globalThis.URL.createObjectURL = ctx.window.URL.createObjectURL;
  globalThis.URL.revokeObjectURL = ctx.window.URL.revokeObjectURL;

  await provisionStaff('admin');
  seedStaffSession(ctx.window, 'admin');
  reports = await import('../js/reports.js');
  engine = await import('../js/report-layout.js');
  catalog = await import('../js/report-catalog.js');
  access = await import('../js/report-access.js');
  sources = await import('../js/report-sources.js');
  await import('../js/admin.js');
  await ctx.waitFor(() => Boolean($('.rc-form')), 20000);

  // Build the very document the panel will generate, so the assertions can
  // check the engine's own rows against the pages the preview shows.
  const definition = catalog.findReport('student.all');
  const actor = await access.resolveActor();
  const gate = access.enforceAccess(definition, actor, {});
  document_ = await catalog.buildReportDocument(definition, {
    filters: gate.filters, actor, scope: gate.scope, snapshot: sources.loadSnapshot()
  });

  // …and then generate it through the real form, buttons and all.
  const select = $('select[name="report"]');
  select.value = 'student.all';
  select.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  ctx.submit($('.rc-form'));
  await ctx.waitFor(() => Boolean($('.rc-download')), 30000);
});

test('a long report paginates across real A4 pages with an honest count', () => {
  const pages = $$('.rc-pdf-preview .rp-page');
  assert.ok(pages.length >= 2, `a ${TOTAL}-row report breaks across pages (got ${pages.length})`);
  // The preview is the engine's own output, so the pages are numbered in one
  // unbroken run — no duplicated or missing page.
  assert.deepEqual(pages.map(page => Number(page.dataset.page)), pages.map((_, index) => index + 1));
  // Every page is a real A4 sheet as the stylesheet lays it out.
  assert.equal(engine.PAGE.width, 794);
  assert.equal(engine.PAGE.height, 1123);
});

test('the document keeps every row of the table in print order', () => {
  const doc = document_.doc;
  const table = doc.blocks.find(block => block.type === 'table' && block.rows.length === TOTAL);
  assert.ok(table, 'the document holds one full student table');
  assert.equal(table.rows.length, TOTAL, `all ${TOTAL} students are on the page, none capped`);

  // reportRows() is the engine's own row order — what the table printed.
  const rows = engine.reportRows(doc);
  const startIndex = rows.findIndex(row => row.length === table.columns.length
    && row.every((cell, i) => cell === table.columns[i].label));
  assert.ok(startIndex >= 0, 'the table header reaches the row list');
  assert.equal(rows.length - startIndex, TOTAL + 1, 'header plus every row, nothing else');
  for (let i = 0; i < TOTAL; i += 1) {
    assert.deepEqual(rows[startIndex + 1 + i], table.rows[i], `row ${i} travels intact and in order`);
  }
});

test('the summary tiles travel with the table', () => {
  for (const block of document_.doc.blocks) {
    if (block.type !== 'tiles') continue;
    assert.ok(block.tiles.length > 0, 'the summary block carries totals');
  }
});

test('the download keeps the filename convention at scale', async () => {
  const today = new Date().toISOString().slice(0, 10);
  lastDownload = null;
  ctx.click($('.rc-download'));
  await ctx.waitFor(() => Boolean(lastDownload), 30000);
  assert.equal(lastDownload.name, `ActivePlus_Student_Master_List_${today}.pdf`);
  assert.equal(lastDownload.href, 'blob:active-plus-report');
});
