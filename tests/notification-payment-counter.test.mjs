/* Payment counter: an entry the Manager rejected is announced with the
   reason; approved entries and other panels' kinds stay silent. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { KEYS, STAFF_KEYS } from '../js/database.js';

let ctx; let controller; let shown;
async function boot(page, accountKey, username, seed) {
  ctx = await loadPage(page);
  shown = [];
  class FakeNotification { constructor(title, options) { shown.push({ title, options: options || {} }); } close() {} }
  FakeNotification.permission = 'granted';
  FakeNotification.requestPermission = async () => 'granted';
  ctx.window.Notification = FakeNotification;
  const store = ctx.window.localStorage;
  store.setItem(accountKey, JSON.stringify({ username }));
  store.setItem(`activePlus.notifications.boot.v1:staff:${username}`, JSON.stringify({ version: 1, at: Date.now() - 60000 }));
  store.setItem(`activePlus.notifications.rules.v1:staff:${username}`, JSON.stringify({ version: 2, at: Date.now() - 60000 }));
  seed(store);
  controller = (await import('../js/notifications.js')).initNotifications();
  await ctx.flush();
}

const entry = extra => ({ id: 'T1', receiptNo: 'R7', studentId: 's1', studentName: 'রহিম', feeType: 'মাসিক বেতন', month: 'অক্টোবর', amount: 1500, status: 'pending', recordedAt: Date.now(), ...extra });
before(async () => {
  await boot('payment.html', STAFF_KEYS.paymentAccount, 'payment.apc', store => {
    store.setItem(KEYS.transactions, JSON.stringify([entry()]));
    store.setItem(KEYS.students, JSON.stringify([{ id: 's9', name: 'নতুন', status: 'pending' }]));
  });
});

test('pending entries and registrations are not the counter’s notifications', () => {
  assert.deepEqual(controller.feed(), []);
});

test('an approved entry stays silent; a rejected one is announced with the reason', async () => {
  ctx.window.localStorage.setItem(KEYS.transactions, JSON.stringify([
    entry({ status: 'approved', reviewedAt: new Date().toISOString() }),
    entry({ id: 'T2', receiptNo: 'R8', status: 'rejected', reviewedAt: new Date().toISOString(), reviewNote: 'মাস ভুল লেখা হয়েছে' })
  ]));
  controller.refresh();
  await ctx.flush();
  assert.equal(shown.length, 1);
  assert.equal(shown[0].title, 'পেমেন্ট এন্ট্রি বাতিল হয়েছে');
  assert.match(shown[0].options.body, /মাস ভুল লেখা হয়েছে/);
});

test('the page booted without errors', () => assert.deepEqual(ctx.jsdomErrors, []));
