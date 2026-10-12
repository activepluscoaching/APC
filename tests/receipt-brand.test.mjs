/* The money receipt header: institution name, tagline, and the address on its
   own line underneath. Covers both the HTML receipt (admin panel + payment
   counter) and the canvas receipt that becomes the PDF/PNG download. */
import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { STORAGE_KEYS, DEFAULT_APP_SETTINGS } from '../js/config.js';

const TAGLINE = 'শিখতে থাকো, এগিয়ে যাও';
const ADDRESS = 'কলেজ রোড, দিনাজপুর সদর';
const tx = {
  id: 'TRX-1', receiptNo: 'REC-2609-01', date: '২৩ সেপ্টেম্বর ২০২৬',
  studentName: 'রাইসা ইসলাম', studentId: 'AP-1024', className: 'দশম শ্রেণি',
  feeType: 'মাসিক বেতন', month: 'সেপ্টেম্বর ২০২৬', method: 'নগদ', trxRef: '',
  amount: 1500, note: '', collectedBy: 'এডমিন'
};

let ctx, receiptMarkup, renderReceiptCanvas;
const drawn = [];

before(async () => {
  ctx = await loadPage('index.html', {
    seed: { [STORAGE_KEYS.appConfig]: JSON.stringify({ tagline: TAGLINE, campusAddress: ADDRESS }) }
  });
  // jsdom has no canvas/font/image decoding; only those cosmetic APIs are stubbed.
  const fake = {
    font: '', fillStyle: '', textAlign: 'left', strokeStyle: '', lineWidth: 1,
    measureText: text => ({ width: String(text).length * 8 }),
    fillText: (text, x, y) => drawn.push({ text: String(text), x, y, font: fake.font }),
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, drawImage() {}, scale() {}
  };
  ctx.window.HTMLCanvasElement.prototype.getContext = () => fake;
  ctx.window.Image.prototype.decode = function decode() { return Promise.resolve(); };
  // The module resolves these from the global scope, not from `window`.
  globalThis.FontFace = ctx.window.FontFace = class FontFace { load() { return Promise.resolve(this); } };
  Object.defineProperty(ctx.window.document, 'fonts', { value: { add() {} }, configurable: true });
  ({ receiptMarkup, renderReceiptCanvas } = await import('../js/finance-receipt.js'));
});

beforeEach(() => {
  drawn.length = 0;
  ctx.window.localStorage.setItem(STORAGE_KEYS.appConfig, JSON.stringify({ tagline: TAGLINE, campusAddress: ADDRESS }));
});

test('the HTML receipt puts the address on its own line under the tagline', () => {
  ctx.document.body.innerHTML = receiptMarkup(tx);
  const tagline = ctx.$('.receipt-sub');
  const address = ctx.$('.receipt-address');
  assert.equal(tagline.textContent, TAGLINE);
  assert.equal(address.textContent, ADDRESS);
  assert.equal(address.previousElementSibling, tagline, 'the address sits directly below the tagline');
  assert.equal(tagline.textContent.includes(ADDRESS), false, 'the tagline no longer carries the address');
  // Still above the paid badge and the rest of the receipt.
  assert.equal(ctx.$('.receipt-badge-title').previousElementSibling, address);
});

test('the simple canvas statement has one address under the institution name, with no slogan row', async () => {
  await renderReceiptCanvas(tx);
  const name = drawn.find(item => item.text === 'Active Plus Coaching');
  const address = drawn.filter(item => item.text === ADDRESS);
  const title = drawn.find(item => item.text === 'পেমেন্ট স্টেটমেন্ট');
  assert.equal(address.length, 1);
  assert.ok(address[0].y > name.y && title.y > address[0].y);
  assert.equal(drawn.some(item => item.text.includes(TAGLINE)), false, 'promotional slogans are omitted from the statement');
});

test('a long address wraps onto extra lines without crowding the statement title', async () => {
  drawn.length = 0;
  ctx.window.localStorage.setItem(STORAGE_KEYS.appConfig, JSON.stringify({ tagline: TAGLINE, campusAddress: 'অত্যন্ত লম্বা একটি ঠিকানা যা এক লাইনে ধরবে না বলে দুই লাইনে ভাগ হবে এবং নিচে আরও লেখা থাকলে সেটিও যুক্ত হবে' }));
  const canvas = await renderReceiptCanvas(tx);
  const headerLines = drawn.filter(item => item.font.endsWith('15px ReceiptBangla'));
  assert.ok(headerLines.length >= 2, 'the address wrapped onto more than one line');
  assert.ok(headerLines.slice(1).every((line, index) => line.y - headerLines[index].y === 22));
  const title = drawn.find(item => item.text === 'পেমেন্ট স্টেটমেন্ট');
  assert.ok(title.y - headerLines.at(-1).y >= 32, 'the statement title moves down and leaves a clear gap after the last address line');
  assert.ok(canvas.height > 0);
});

test('a legacy tagline containing the address prints that address only once', async () => {
  drawn.length = 0;
  const config = JSON.stringify({ tagline: `${TAGLINE} • ${ADDRESS}`, campusAddress: ADDRESS });
  ctx.window.localStorage.setItem(STORAGE_KEYS.appConfig, config);
  ctx.document.body.innerHTML = receiptMarkup(tx);
  assert.equal(ctx.$('.receipt-sub').textContent, TAGLINE);
  assert.equal(ctx.$('.receipt-address').textContent, ADDRESS);
  assert.equal(ctx.$('.receipt-header').textContent.split(ADDRESS).length - 1, 1);
  await renderReceiptCanvas(tx);
  assert.equal(drawn.filter(item => item.text.includes(ADDRESS)).length, 1);
  assert.equal(ctx.window.localStorage.getItem(STORAGE_KEYS.appConfig), config, 'formatting must not rewrite saved settings');
});

test('legacy separators, newlines and leading addresses keep the original slogan', async () => {
  for (const tagline of [`${TAGLINE} | ${ADDRESS}`, `${TAGLINE} · ${ADDRESS}`, `${TAGLINE}\n${ADDRESS}`, `${ADDRESS} • ${TAGLINE}`, `${TAGLINE} — ${ADDRESS}`, `${TAGLINE} • ${ADDRESS} • ${ADDRESS}`]) {
    drawn.length = 0;
    ctx.window.localStorage.setItem(STORAGE_KEYS.appConfig, JSON.stringify({ tagline, campusAddress: ADDRESS }));
    ctx.document.body.innerHTML = receiptMarkup(tx);
    assert.equal(ctx.$('.receipt-sub').textContent, TAGLINE, tagline);
    await renderReceiptCanvas(tx);
    assert.equal(drawn.filter(item => item.text.includes(ADDRESS)).length, 1, tagline);
  }
});

test('an address-only tagline falls back to the real slogan instead of another address', async () => {
  ctx.window.localStorage.setItem(STORAGE_KEYS.appConfig, JSON.stringify({ tagline: ADDRESS, campusAddress: ADDRESS }));
  ctx.document.body.innerHTML = receiptMarkup(tx);
  assert.equal(ctx.$('.receipt-sub').textContent, TAGLINE);
  await renderReceiptCanvas(tx);
  assert.equal(drawn.filter(item => item.text === ADDRESS).length, 1);
});

test('a legacy default address is not left behind after the campus address changes', async () => {
  const previous = DEFAULT_APP_SETTINGS.campusAddress;
  ctx.window.localStorage.setItem(STORAGE_KEYS.appConfig, JSON.stringify({ tagline: `${TAGLINE} • ${previous}`, campusAddress: ADDRESS }));
  ctx.document.body.innerHTML = receiptMarkup(tx);
  assert.equal(ctx.$('.receipt-sub').textContent, TAGLINE);
  await renderReceiptCanvas(tx);
  assert.equal(drawn.filter(item => item.text.includes(previous)).length, 0);
  assert.equal(drawn.filter(item => item.text === ADDRESS).length, 1);
});

test('complete copied address blocks are deduplicated, but genuine distinct lines stay', async () => {
  const lines = ['ভবন ১০, তৃতীয় তলা', 'কলেজ রোড, দিনাজপুর সদর'];
  const address = lines.join('\n');
  const config = JSON.stringify({ tagline: TAGLINE, campusAddress: `${address}\n${address}` });
  ctx.window.localStorage.setItem(STORAGE_KEYS.appConfig, config);
  ctx.document.body.innerHTML = receiptMarkup(tx);
  assert.equal(ctx.$('.receipt-address').textContent, address);
  await renderReceiptCanvas(tx);
  for (const line of lines) assert.equal(drawn.filter(item => item.text === line).length, 1);
  assert.equal(ctx.window.localStorage.getItem(STORAGE_KEYS.appConfig), config);
});

test('similar place words within one legitimate address and a custom slogan are preserved', async () => {
  const address = 'দিনাজপুর সদর, দিনাজপুর';
  const tagline = 'দিনাজপুরের শিক্ষার্থীদের জন্য ভালো শিক্ষা';
  ctx.window.localStorage.setItem(STORAGE_KEYS.appConfig, JSON.stringify({ tagline, campusAddress: address }));
  ctx.document.body.innerHTML = receiptMarkup(tx);
  assert.equal(ctx.$('.receipt-sub').textContent, tagline);
  assert.equal(ctx.$('.receipt-address').textContent, address);
  await renderReceiptCanvas(tx);
  assert.equal(drawn.filter(item => item.text === tagline).length, 0, 'the HTML keeps the custom slogan, but the printed statement intentionally omits it');
  assert.equal(drawn.filter(item => item.text === address).length, 1);
});

test('address matching is literal, whitespace-tolerant and safe for regex punctuation', async () => {
  const address = 'Road (North) [Block A] + Campus.2';
  const tagline = `Learning for life • Road  (North) [Block A]  + Campus.2`;
  ctx.window.localStorage.setItem(STORAGE_KEYS.appConfig, JSON.stringify({ tagline, campusAddress: address }));
  ctx.document.body.innerHTML = receiptMarkup(tx);
  assert.equal(ctx.$('.receipt-sub').textContent, 'Learning for life');
  await renderReceiptCanvas(tx);
  assert.equal(drawn.filter(item => item.text === address).length, 1);
});

test('duplicate cleanup does not unescape header markup or create active HTML', () => {
  const address = '<img src=x onerror=alert(1)> Campus';
  const tagline = `নতুন শেখা <script>alert(1)</script> • ${address}`;
  ctx.window.localStorage.setItem(STORAGE_KEYS.appConfig, JSON.stringify({ tagline, campusAddress: address }));
  ctx.document.body.innerHTML = receiptMarkup(tx);
  assert.equal(ctx.$('.receipt-sub').textContent, 'নতুন শেখা <script>alert(1)</script>');
  assert.equal(ctx.$('.receipt-address').textContent, address);
  assert.equal(ctx.$('.receipt-header').querySelectorAll('script,[onerror]').length, 0);
});


test('complete inline pasted address blocks are deduplicated without altering genuine address parts', async () => {
  for (const separator of [' • ', ' | ', ' — ', ' - ', '; ']) {
    drawn.length = 0;
    const saved = JSON.stringify({ tagline: TAGLINE, campusAddress: `${ADDRESS}${separator}${ADDRESS}` });
    ctx.window.localStorage.setItem(STORAGE_KEYS.appConfig, saved);
    ctx.document.body.innerHTML = receiptMarkup(tx);
    assert.equal(ctx.$('.receipt-address').textContent, ADDRESS);
    await renderReceiptCanvas(tx);
    assert.equal(drawn.filter(item => item.text === ADDRESS).length, 1);
    assert.equal(ctx.window.localStorage.getItem(STORAGE_KEYS.appConfig), saved);
  }
  const real = `ভবন ১০ • ${ADDRESS}`;
  ctx.window.localStorage.setItem(STORAGE_KEYS.appConfig, JSON.stringify({ tagline: TAGLINE, campusAddress: `${real} • ${real}` }));
  ctx.document.body.innerHTML = receiptMarkup(tx);
  assert.equal(ctx.$('.receipt-address').textContent, real, 'a distinct building/road block stays intact');
});
