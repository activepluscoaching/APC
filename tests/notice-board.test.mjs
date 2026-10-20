/* Student-facing notices have their own categories and explicit Read ✓ receipts. */
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { KEYS } from '../js/database.js';
import { NOTICE_CATEGORIES, noticeCategory, noticeItem } from '../js/notification-rules.js';

const student = { id: 'NB-STUDENT-1', name: 'রাইসা', className: 'দশম শ্রেণি', group: 'বিজ্ঞান বিভাগ' };
const notice = (id, category, createdAt, extra = {}) => ({
  id, category, title: `Notice ${id}`, body: `বিস্তারিত ${id}`, audience: 'সকল শিক্ষার্থী',
  status: 'published', createdAt, ...extra
});

test('notice categories normalize known labels and safely default legacy notices to Academic', () => {
  assert.deepEqual(NOTICE_CATEGORIES.map(item => item.id), ['urgent', 'academic', 'class', 'fee', 'exam']);
  assert.equal(noticeCategory({ category: '🔴 জরুরি' }), 'urgent');
  assert.equal(noticeCategory({ category: 'Class' }), 'class');
  assert.equal(noticeCategory({ category: 'ফি' }), 'fee');
  assert.equal(noticeCategory({ urgent: true }), 'urgent');
  assert.equal(noticeCategory({ title: 'পুরোনো notice' }), 'academic');
});

test('the Notice Board filters and opens notices separately from the bell, then saves Read ✓ per student', async t => {
  const ctx = await loadPage('student.html', { seed: {
    [KEYS.account]: JSON.stringify({ username: 'raisa', status: 'active', student }),
    [KEYS.notices]: JSON.stringify([
      notice('NB-U', 'urgent', '2026-10-04T10:00:00.000Z', { title: 'জরুরি ঘোষণা', body: '<img src=x onerror=alert(1)> আজই দেখে নাও।' }),
      notice('NB-A', 'academic', '2026-10-03T10:00:00.000Z'),
      notice('NB-C', 'class', '2026-10-02T10:00:00.000Z'),
      notice('NB-F', 'fee', '2026-10-01T10:00:00.000Z'),
      notice('NB-E', 'exam', '2026-09-30T10:00:00.000Z'),
      notice('NB-PRIVATE', 'fee', '2026-10-04T11:00:00.000Z', { audience: 'শুধু শিক্ষক' })
    ]),
    [KEYS.settings]: JSON.stringify({ broadcastAlert: true, broadcastMessage: '<svg onload=alert(1)> জরুরি সার্ভার ঘোষণা' })
  } });
  t.after(() => ctx.window.close());
  ctx.$('#appShell').hidden = false;
  let currentStudent = student;
  const { initStudentNoticeBoard } = await import('../js/student-notice-board.js?notice-board-test');
  const board = initStudentNoticeBoard({ getStudent: () => currentStudent });
  const { initNotifications } = await import('../js/notifications.js?notice-board-separation-test');
  const inbox = initNotifications();
  await ctx.waitFor(() => Boolean(ctx.window.apcNoticeCenter), 3000);
  await ctx.flush();

  assert.deepEqual(board.refresh(), { total: 6, unread: 6 }, 'five audience-matched notices plus the urgent broadcast');
  assert.deepEqual(
    ctx.$$('#noticeBoardCategories [data-notice-board-category]').map(tab => tab.dataset.noticeBoardCategory),
    ['all', 'urgent', 'academic', 'class', 'fee', 'exam']
  );
  assert.equal(ctx.$('#notificationButton .notification-dot').hidden, true, 'Board notices do not inflate the general notification badge');
  assert.equal(inbox.unread(), 0);
  assert.ok(inbox.feed().every(item => !['notice', 'broadcast'].includes(item.kind)), 'the bell feed excludes Board notices');

  ctx.click(ctx.$('#notificationButton'));
  assert.doesNotMatch(ctx.$('#noticeModal').textContent, /Notice NB-U|জরুরি সার্ভার ঘোষণা/);
  assert.match(ctx.$('#noticeModal').textContent, /আলাদা নোটিশ বোর্ড/);
  ctx.click(ctx.$('#noticeModal .modal-close'));

  const tapped = noticeItem({ id: 'NB-U', title: 'জরুরি ঘোষণা', body: 'বিস্তারিত NB-U', createdAt: '2026-10-04T10:00:00.000Z' });
  assert.equal(await inbox.openItem({ kind: 'notice', sourceId: 'NB-U', key: tapped.key }), true, 'a push tap opens the separate Board');
  assert.equal(ctx.$('#noticeBoardDetail').hidden, false);
  assert.equal(ctx.$('#noticeBoardReadButton').disabled, false, 'opening does not implicitly mark the notice read');
  assert.equal(board.refresh().unread, 6);
  ctx.click(ctx.$('#noticeBoardDetail [data-notice-board-close]'));

  ctx.click(ctx.$('#noticeBoardCategories [data-notice-board-category="fee"]'));
  assert.equal(ctx.$$('#noticeBoardList .notice-board-card').length, 1);
  assert.match(ctx.$('#noticeBoardList').textContent, /Notice NB-F/);
  assert.doesNotMatch(ctx.$('#noticeBoardList').textContent, /NB-PRIVATE/);

  ctx.click(ctx.$('#noticeBoardCategories [data-notice-board-category="all"]'));
  const urgentCard = [...ctx.$$('#noticeBoardList .notice-board-card')].find(card => card.textContent.includes('জরুরি ঘোষণা'));
  assert.ok(urgentCard, 'the urgent notice has its own category card');
  ctx.click(urgentCard.querySelector('[data-notice-board-open]'));
  assert.equal(ctx.$('#noticeBoardDetail').hidden, false);
  assert.equal(ctx.$('#noticeBoardDetailTitle').textContent, 'জরুরি ঘোষণা');
  assert.equal(ctx.$('#noticeBoardDetailBody').textContent, '<img src=x onerror=alert(1)> আজই দেখে নাও।');
  assert.equal(ctx.$$('#noticeBoardDetail img').length, 0, 'notice content is rendered as text, not markup');
  const readButton = ctx.$('#noticeBoardReadButton');
  assert.equal(readButton.textContent, 'পড়া হয়েছে ✓');
  ctx.click(readButton);
  assert.equal(ctx.$('#noticeBoardReadButton').textContent, 'পড়া হয়েছে ✓');
  assert.equal(ctx.$('#noticeBoardReadButton').disabled, true);
  assert.equal(board.refresh().unread, 5);
  assert.equal(inbox.unread(), 0, 'reading a notice does not change the general notification count');
  const receiptKey = 'activePlus.noticeBoard.read.v1:NB-STUDENT-1';
  const saved = JSON.parse(ctx.window.localStorage.getItem(receiptKey));
  assert.ok(saved.keys.some(key => key.startsWith('notice:NB-U:')));

  currentStudent = { ...student, id: 'NB-OTHER-STUDENT' };
  assert.equal(board.refresh().unread, 6, 'Read ✓ belongs to this student, not another account on the device');
});

test('notice detail is a single view and one notice id never paints twice', async t => {
  const ctx = await loadPage('student.html', { seed: {
    [KEYS.account]: JSON.stringify({ username: 'raisa', status: 'active', student }),
    [KEYS.notices]: JSON.stringify([
      notice('NB-1', 'academic', '2026-10-04T10:00:00.000Z', { title: 'প্রথম নোটিশ', body: 'পূর্ণ বিস্তারিত বডি।' }),
      notice('NB-1', 'academic', '2026-10-04T09:00:00.000Z', { title: 'পুরনো কপি', body: 'ডুপ্লিকেট সোর্স।' }),
      notice('NB-2', 'exam', '2026-10-03T10:00:00.000Z', { title: 'আরেকটি নোটিশ', body: 'বডি দুই।' })
    ])
  } });
  t.after(() => ctx.window.close());
  ctx.$('#appShell').hidden = false;
  const { initStudentNoticeBoard } = await import('../js/student-notice-board.js?notice-board-single-view-test');
  const board = initStudentNoticeBoard({ getStudent: () => student });
  await ctx.flush();

  /* 5) one board row per notice id — the newer source row wins */
  assert.deepEqual(board.refresh(), { total: 2, unread: 2 }, 'a duplicated notice id collapses into one row');
  assert.equal(ctx.$$('#noticeBoardList .notice-board-card').length, 2);
  assert.match(ctx.$('#noticeBoardList').textContent, /প্রথম নোটিশ/);
  assert.doesNotMatch(ctx.$('#noticeBoardList').textContent, /পুরনো কপি/);

  /* 1) tapping the card body opens only the full notice */
  ctx.click(ctx.$$('#noticeBoardList .notice-board-card')[0]);
  assert.equal(ctx.$('#noticeBoardDetail').hidden, false);
  assert.match(ctx.$('#noticeBoardDetail').textContent, /পূর্ণ বিস্তারিত বডি।/);
  assert.equal(ctx.$('#noticeBoardList').hidden, true, 'the list leaves the screen while the detail is open');
  assert.equal(ctx.window.document.body.classList.contains('notice-board-detail-open'), true);
  const css = readFileSync(new URL('../css/notice-board.css', import.meta.url), 'utf8');
  assert.match(css, /\.notice-board-detail:not\(\[hidden\]\)\{[^}]*position:fixed/, 'the open detail is a fixed modal sheet');
  assert.match(css, /\.notice-board-list\[hidden\]\{display:none/, 'a hidden list can never show through');

  /* 2) backdrop click closes back to the plain list */
  ctx.click(ctx.window.document.body);
  assert.equal(ctx.$('#noticeBoardDetail').hidden, true);
  assert.equal(ctx.$('#noticeBoardList').hidden, false);
  assert.equal(ctx.window.document.body.classList.contains('notice-board-detail-open'), false);

  /* 2b) × closes too */
  ctx.click(ctx.$$('#noticeBoardList .notice-board-card')[0]);
  assert.equal(ctx.$('#noticeBoardDetail').hidden, false);
  ctx.click(ctx.$('#noticeBoardDetail [data-notice-board-close]'));
  assert.equal(ctx.$('#noticeBoardDetail').hidden, true);
  assert.equal(ctx.$('#noticeBoardList').hidden, false);

  /* 3) «পড়া হয়েছে ✓» marks read and drops the unread count */
  ctx.click(ctx.$$('#noticeBoardList .notice-board-card')[0]);
  assert.equal(board.refresh().unread, 2);
  assert.equal(ctx.$('#noticeBoardReadButton').disabled, false);
  ctx.click(ctx.$('#noticeBoardReadButton'));
  assert.equal(board.refresh().unread, 1);
  assert.equal(ctx.$('#noticeBoardReadButton').disabled, true);
  assert.equal(ctx.$('#noticeBoardReadButton').textContent, 'পড়া হয়েছে ✓');

  /* 4) no English board labels anywhere */
  const boardText = ctx.$('#notice-boardView').textContent;
  assert.doesNotMatch(boardText, /Notice Board|Notice খুলুন|Read ✓|Academic|Class|Fee|Exam/);
  const source = readFileSync(new URL('../js/student-notice-board.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /'Notice Board'|'Notice খুলুন'|'Read ✓'|'Academic'|'Class'|'Fee'|'Exam'/);
});
