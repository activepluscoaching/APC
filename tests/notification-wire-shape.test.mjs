/* Client ↔ sender wire agreement (audit round 6).
   The Cloud Functions read the cloud nodes with fixed expectations, and the
   in-app notification feed rebuilds the same events from local data. If the
   bridge ever encoded a record differently (a renamed field, a wrapped value,
   a relocated node) the two halves would drift apart silently: pushes would
   arrive for events the app cannot show, or events the office published would
   never be pushed.

   This runs the REAL client modules against the mock Realtime Database, then
   feeds the resulting cloud nodes to the REAL sender rules and to the REAL
   in-app feed, asserting that all three describe the same four events. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockCloud, Device } from './two-device-harness.mjs';
import payload from '../functions/notification-payload.js';
import { notificationFeed, noticeItem, examItems } from '../js/notification-rules.js';
import { KEYS } from '../js/database.js';

const { noticePush, broadcastPush, examPushes } = payload;

let cloud = null;
let device = null;

const root = () => cloud.state.activePlusSync?.v1 || {};

async function waitFor(predicate, what, timeout = 10000) {
  const started = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - started > timeout) throw new Error('cloud wait timed out: ' + what);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

const NOW = Date.now();
const NOTICE_TITLE = 'আগামীকাল ছুটি';
const NOTICE_BODY = 'শুক্রবার বন্ধ';
const BROADCAST_MESSAGE = 'জরুরি: আগামীকাল ছুটি';
const EXAM_SOON = {
  id: 'EX1', title: 'মডেল টেস্ট', subject: 'গণিত', type: 'mcq', status: 'published', teacherId: 'T1',
  teacherName: 'শিক্ষক', participants: [{ id: 'AP-1024', name: 'রাইসা' }], questions: [],
  startAt: NOW + 3600000, endAt: NOW + 7200000, publishedAt: NOW - 60000,
  createdAt: '2026-09-29T00:00:00.000Z'
};
/* Published long ago, already over, results not out yet: the case where the
   sender used to push an announcement the app could not list. */
const EXAM_OVER = {
  id: 'EX3', title: 'পুরোনো পরীক্ষা', subject: 'ইংরেজি', type: 'mcq', status: 'published', teacherId: 'T1',
  teacherName: 'শিক্ষক', participants: [{ id: 'AP-1024', name: 'রাইসা' }], questions: [],
  startAt: NOW - 7200000, endAt: NOW - 3600000, publishedAt: NOW - 7000000,
  createdAt: '2026-09-27T00:00:00.000Z'
};
const EXAM_DONE = {
  id: 'EX2', title: 'সাপ্তাহিক পরীক্ষা', subject: 'বিজ্ঞান', type: 'mcq', status: 'published', teacherId: 'T1',
  teacherName: 'শিক্ষক', participants: [{ id: 'AP-1024', name: 'রাইসা' }], questions: [],
  startAt: NOW - 7200000, endAt: NOW - 3600000, resultsPublished: true, resultsPublishedAt: NOW - 60000,
  createdAt: '2026-09-28T00:00:00.000Z'
};

before(async () => {
  cloud = await startMockCloud();
  const harness = await import('./two-device-harness.mjs');
  harness.buildDevices({ quietConsoleError: true }).buildAppCopy(cloud.url);
  device = new Device('W', cloud.url);
  device.start();
  await device.run('boot');
  await device.run('write-records', {
    key: KEYS.notices,
    value: [{
      id: 'NOT1', title: NOTICE_TITLE, body: NOTICE_BODY, audience: 'সকল শিক্ষার্থী',
      status: 'published', author: 'manager.apc', date: '২৯ সেপ্টেম্বর', createdAt: new Date(NOW).toISOString()
    }]
  });
  await device.run('write-records', {
    key: KEYS.settings,
    value: { pushNotifications: true, broadcastAlert: true, broadcastMessage: 'জরুরি: আগামীকাল ছুটি' }
  });
  await device.run('seed-exam-db', { exams: [EXAM_SOON, EXAM_DONE, EXAM_OVER], attempts: [] });
  await waitFor(() => root().notices?.NOT1, 'notice reaches the cloud');
  await waitFor(() => root().settings?.broadcastAlert === true, 'settings reach the cloud');
  await waitFor(
    () => ['EX1', 'EX2', 'EX3'].every(id => root().examDb?.exams?.[id]),
    'exams reach the cloud'
  );
});

after(async () => {
  await Promise.allSettled([device?.stop()]);
  await new Promise(resolve => cloud?.server?.close(resolve));
});

test('the bridge stores each record in the shape the sender reads', () => {
  const notice = root().notices.NOT1;
  // No wrapper, no renamed field: the sender reads these names directly.
  assert.equal(notice.status, 'published');
  assert.equal(notice.title, NOTICE_TITLE);
  assert.equal(notice.audience, 'সকল শিক্ষার্থী');
  assert.equal(notice.author, 'manager.apc');

  assert.equal(root().settings.broadcastAlert, true);
  assert.equal(root().settings.broadcastMessage, 'জরুরি: আগামীকাল ছুটি');

  const exam = root().examDb.exams.EX1;
  assert.equal(exam.status, 'published');
  assert.equal(exam.participants[0].id, 'AP-1024');
  assert.ok(exam.startAt > Date.now(), 'a published paper still to come');
  assert.equal(root().examDb.exams.EX2.resultsPublished, true);
});

test('every event the sender pushes is findable in the app', () => {
  const notice = root().notices.NOT1;
  const push = noticePush(null, notice);
  assert.equal(push.kind, 'notice');
  assert.equal(push.data.collection, 'notices');
  assert.equal(push.data.id, 'NOT1');

  const broadcast = broadcastPush(null, root().settings);
  assert.equal(broadcast.kind, 'broadcast');
  assert.equal(broadcast.body, BROADCAST_MESSAGE);

  const examNodes = Object.values(root().examDb?.exams || {});
  const pushes = examNodes.flatMap(exam => examPushes(null, exam, NOW));
  assert.deepEqual(pushes.map(item => item.kind).sort(), ['exam', 'result'],
    'one upcoming paper and one released result; the finished paper without results is silent');
  assert.ok(pushes.every(item => item.studentIds.includes('AP-1024')), 'only participants are addressed');

  /* The device must be able to show every one of those pushes. */
  const feed = notificationFeed({
    notices: Object.values(root().notices || {}),
    config: root().settings,
    examDb: { exams: examNodes, attempts: [] },
    viewer: { kind: 'student', studentId: 'AP-1024' },
    now: NOW
  });
  const kinds = feed.map(item => item.kind).sort();
  assert.deepEqual(kinds, ['broadcast', 'exam', 'notice', 'result'], 'every pushed event is visible in the app');
  for (const kind of new Set(pushes.map(item => item.kind))) {
    assert.ok(feed.some(item => item.kind === kind), `a pushed ${kind} has a matching in-app entry`);
  }
  const keys = feed.map(item => item.key);
  assert.equal(new Set(keys).size, keys.length, 'no event is shown twice');
  assert.ok(noticeItem(notice).key.startsWith('notice:NOT1:'));
});

test('a finished paper is silent on both sides — the audit round 6 drift', () => {
  const over = root().examDb.exams.EX3;
  assert.deepEqual(examPushes(null, over, NOW), [], 'the sender stays quiet');
  assert.deepEqual(examItems({ exams: [over], attempts: [] }, { kind: 'student', studentId: 'AP-1024' }, NOW), [],
    'and the app has nothing to list: a push here would lead nowhere');
});

test('a non-participant student is never told about the paper', () => {
  const pushes = examPushes(null, root().examDb.exams.EX1);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].studentIds.includes('AP-9999'), false);
  const feed = notificationFeed({
    notices: [],
    config: null,
    examDb: { exams: [EXAM_SOON], attempts: [] },
    viewer: { kind: 'student', studentId: 'AP-9999' },
    now: NOW
  });
  assert.deepEqual(feed, []);
});

test('every read and write the app made was allowed by the deployed database.rules.json', () => {
  assert.deepEqual(cloud.ruleViolations, [], 'the shipped client and the shipped rules must agree');
});
