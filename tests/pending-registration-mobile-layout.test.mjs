import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const read = rel => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

test('CSS cascade keeps #apcRegistrationReview .apc-review-details single-column and horizontal on mobile', () => {
  for (const portal of ['admin.html', 'manager.html']) {
    const html = read(portal);
    const hrefs = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1]);
    assert.ok(hrefs.includes('css/ui-components.css'), `${portal} loads ui-components.css`);
    assert.ok(hrefs.includes('css/ui-features.css'), `${portal} loads ui-features.css`);
    assert.ok(hrefs.includes('css/ui-wallet.css'), `${portal} loads ui-wallet.css`);
    assert.ok(hrefs.indexOf('css/ui-features.css') > hrefs.indexOf('css/ui-components.css'));
    assert.ok(hrefs.indexOf('css/ui-wallet.css') > hrefs.indexOf('css/ui-features.css'));
  }

  const featuresCss = read('css/ui-features.css');
  const walletCss = read('css/ui-wallet.css');

  assert.match(
    featuresCss,
    /\.apc-review-details\{[^}]*grid-template-columns:minmax\(0,1fr\)/,
    'ui-features.css overrides global dl 2-column grid with a single column'
  );
  assert.doesNotMatch(
    featuresCss,
    /\.apc-review-row dd\{[^}]*overflow-wrap:anywhere/,
    'ui-features.css must not force character-by-character overflow-wrap:anywhere on dd'
  );
  assert.match(
    walletCss,
    /#apcRegistrationReview \.apc-review-details\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    'ui-wallet.css locks #apcRegistrationReview .apc-review-details to 1 column'
  );
  assert.match(
    walletCss,
    /#apcRegistrationReview \.apc-review-row dd\s*\{[^}]*word-break:\s*normal;[^}]*overflow-wrap:\s*break-word;[^}]*writing-mode:\s*horizontal-tb/s,
    'review field values always render horizontally without vertical character stacking'
  );
});

test('Action Center CSS Grid orders pending approvals above filters/empty state and structures push footer', () => {
  const walletCss = read('css/ui-wallet.css');
  assert.match(
    walletCss,
    /:is\(#noticeModal, #apcNoticeModal\) \.apc-pending-host\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*grid-row:\s*3;/s,
    '.apc-pending-host spans full sheet width in row 3 above filters'
  );
  assert.match(
    walletCss,
    /:is\(#noticeModal, #apcNoticeModal\):not\(\[hidden\]\) \.modal:has\(\.apc-pending-host:not\(\.is-empty\)\)\s*\{[^}]*grid-template-rows:\s*auto auto auto auto auto auto;[^}]*overflow-y:\s*auto;/s,
    'Action Center switches to a 6-row scrollable sheet when pending registrations are present'
  );
  assert.match(
    walletCss,
    /:is\(#noticeModal, #apcNoticeModal\) \.modal:has\(\.apc-pending-host:not\(\.is-empty\)\) \.notice-filters\s*\{[^}]*grid-row:\s*4;/s
  );
  assert.match(
    walletCss,
    /:is\(#noticeModal, #apcNoticeModal\) \.modal:has\(\.apc-pending-host:not\(\.is-empty\)\) :is\(#noticeListStudent, \[data-apc-notice-list\]\)\s*\{[^}]*grid-row:\s*5;/s
  );
  assert.match(
    walletCss,
    /:is\(#noticeModal, #apcNoticeModal\) \.modal:has\(\.apc-pending-host:not\(\.is-empty\)\) \[data-apc-notice-push\]\s*\{[^}]*grid-row:\s*6;/s
  );
  assert.match(
    walletCss,
    /:is\(#noticeModal, #apcNoticeModal\) \[data-apc-notice-push\]\s*\{[^}]*display:\s*flex;/s,
    'device notification toggle row uses flex layout so button never wraps mid-sentence'
  );
});

test('360px Action Center + Student Registration Detail Modal render clean DOM hierarchy, LTR fields, and toggle empty pending host', async () => {
  const dom = new JSDOM('<!doctype html><html lang="bn"><body><button id="notificationButton" type="button">Bell</button></body></html>', {
    url: 'https://apc.example/admin.html',
    pretendToBeVisual: true
  });
  Object.defineProperty(dom.window, 'innerWidth', { value: 360, configurable: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.HTMLElement = dom.window.HTMLElement;

  const { ROSTER_KEY } = await import('../js/office-data.js');
  const { provisionStaff, seedStaffSession } = await import('./staff-harness.mjs');
  await provisionStaff('admin');
  seedStaffSession(dom.window, 'admin');

  dom.window.localStorage.setItem(ROSTER_KEY, JSON.stringify([
    {
      id: '261023001',
      name: 'মোহাম্মদ সাইফ',
      status: 'pending',
      accountStatus: 'pending',
      className: 'দশম শ্রেণি',
      group: 'বিজ্ঞান',
      fatherName: 'আবদুল করিম',
      mobile: '01811980540',
      email: 'saif@example.com',
      guardianMobile: '01711223344',
      address: 'চট্টগ্রাম',
      registeredAt: '2026-10-23T06:00:00.000Z'
    }
  ]));

  const { mountNoticeCenter } = await import('../js/notice-center.js');
  const { openRegistrationReview } = await import('../js/registration-review.js');

  const center = mountNoticeCenter({
    viewer: () => ({ kind: 'staff', role: 'admin' }),
    feed: () => [],
    unreadKeys: () => [],
    records: () => [],
    markRead: () => true,
    clear: () => {},
    pushSupport: async () => ({ supported: true, permission: 'granted', hasVapidKey: false }),
    disable: async () => {},
    enable: async () => {}
  });

  center.open();
  await new Promise(resolve => setTimeout(resolve, 40));

  const modal = dom.window.document.querySelector('#apcNoticeModal .modal');
  assert.ok(modal, 'Action Center modal exists');

  const children = [...modal.children];
  const idxHeader = children.findIndex(el => el.classList.contains('modal-header'));
  const idxStatus = children.findIndex(el => el.hasAttribute('data-apc-notice-status'));
  const idxPending = children.findIndex(el => el.hasAttribute('data-apc-pending-host'));
  const idxFilters = children.findIndex(el => el.classList.contains('notice-filters'));
  const idxList = children.findIndex(el => el.hasAttribute('data-apc-notice-list'));
  const idxPush = children.findIndex(el => el.hasAttribute('data-apc-notice-push'));

  assert.ok(idxHeader >= 0 && idxStatus > idxHeader, 'header precedes read status');
  assert.ok(idxPending > idxStatus && idxPending < idxFilters, 'pending host sits above filter tabs');
  assert.ok(idxFilters < idxList && idxList < idxPush, 'filters precede list and push toggle footer');

  const pendingHost = modal.querySelector('[data-apc-pending-host]');
  assert.equal(pendingHost.classList.contains('is-empty'), false, 'pending host is visible when pending items exist');
  assert.match(pendingHost.textContent, /অনুমোদনের অপেক্ষায়/);
  assert.match(pendingHost.textContent, /মোহাম্মদ সাইফ/);

  const pushCopy = modal.querySelector('[data-apc-notice-push] .notice-push-copy');
  const pushBtn = modal.querySelector('[data-apc-notice-push] .notice-push-btn');
  assert.ok(pushCopy && pushBtn, 'push footer separates copy and button into dedicated flex children');
  assert.equal(pushBtn.textContent.trim(), 'বন্ধ করুন');

  // Open pending student detail modal and verify horizontal definition rows
  const opened = await openRegistrationReview('261023001', { role: 'admin' });
  assert.equal(opened, true);
  const reviewDialog = dom.window.document.getElementById('apcRegistrationReview');
  assert.ok(reviewDialog, 'Registration review dialog opens');

  const rows = [...reviewDialog.querySelectorAll('.apc-review-details > .apc-review-row')];
  assert.ok(rows.length >= 9, 'all populated student fields render as direct .apc-review-row children');
  const map = new Map(rows.map(r => [r.querySelector('dt')?.textContent.trim(), r.querySelector('dd')]));

  assert.equal(map.get('Student ID')?.textContent.trim(), '261023001');
  assert.equal(map.get('Student ID')?.getAttribute('dir'), 'ltr');
  assert.equal(map.get('অবস্থা')?.textContent.trim(), 'অপেক্ষমাণ');
  assert.ok(map.get('অবস্থা')?.querySelector('.apc-review-status-pill.is-pending'));
  assert.equal(map.get('শ্রেণি')?.textContent.trim(), 'দশম শ্রেণি');
  assert.equal(map.get('বিভাগ / গ্রুপ')?.textContent.trim(), 'বিজ্ঞান');
  assert.equal(map.get('পিতার নাম')?.textContent.trim(), 'আবদুল করিম');
  assert.equal(map.get('মোবাইল')?.textContent.trim(), '01811980540');
  assert.equal(map.get('মোবাইল')?.getAttribute('dir'), 'ltr');
  assert.equal(map.get('অভিভাবকের মোবাইল')?.textContent.trim(), '01711223344');
  assert.equal(map.get('অভিভাবকের মোবাইল')?.getAttribute('dir'), 'ltr');

  // Approve from detail modal -> pending host becomes .is-empty automatically on repaint
  reviewDialog.querySelector('[data-review-decision="approved"]').click();
  await new Promise(resolve => setTimeout(resolve, 60));
  center.refresh();
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(pendingHost.classList.contains('is-empty'), true, 'pending host marks is-empty once queue reaches zero');

  dom.window.close();
});
