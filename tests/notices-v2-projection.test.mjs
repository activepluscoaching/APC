import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createSimulator } from './rtdb-rules-sim.mjs';

const require = createRequire(import.meta.url);
const {
  normalizeNoticeRecord,
  normalizeNoticeDraft,
  publicStudentNoticeCopy,
  noticeMatchesStudent,
  noticeMatchesTeacher,
  buildStudentNoticeProjection,
  buildNoticeFanout,
  advanceNoticeDraftAfterPublish
} = require('../functions/notice-projection.js');

const draftRules = JSON.parse(readFileSync(new URL('../database.rules.v2.draft.json', import.meta.url), 'utf8'));
const sim = createSimulator(draftRules);

test('canonical and draft normalization enforce published/draft invariants and match v2 rules', () => {
  const teacherUser = {
    uid: 'u-teacher-1',
    token: {
      role: 'teacher',
      status: 'active',
      teacherId: 'TCH-1',
      mustChangePassword: false,
      firebase: { sign_in_provider: 'password' }
    }
  };
  const managerUser = {
    uid: 'u-manager-1',
    token: {
      role: 'manager',
      status: 'active',
      mustChangePassword: false,
      firebase: { sign_in_provider: 'password' }
    }
  };

  const draft = normalizeNoticeDraft({
    id: 'ntc-10-sci',
    authorUid: 'u-teacher-1',
    title: 'দশম শ্রেণির পদার্থবিজ্ঞান মডেল টেস্ট',
    body: 'রবিবার বিকেল ৪টায় রুম ২০৩-এ পরীক্ষা অনুষ্ঠিত হবে।',
    classId: 'দশম শ্রেণি',
    group: 'বিজ্ঞান বিভাগ',
    status: 'draft',
    published: false
  });
  assert.equal(sim.canWrite(teacherUser, 'activePlusV2/noticeDraftsByAuthor/u-teacher-1/ntc-10-sci', draft, {}), true);
  assert.throws(() => normalizeNoticeDraft({ ...draft, published: true }), /unpublished draft/);

  const canonical = normalizeNoticeRecord({
    ...draft,
    status: 'published',
    published: true,
    createdByUid: 'u-teacher-1'
  });
  assert.equal(sim.canWrite(managerUser, 'activePlusV2/notices/ntc-10-sci', canonical, {}), true);

  const studentCopy = publicStudentNoticeCopy(canonical);
  assert.equal('createdByUid' in studentCopy, false, 'internal UIDs never leak into student projections');
  assert.equal(studentCopy.published, true);
});

test('fan-out projects only to matching approved students and retracts stale copies when scope changes', () => {
  const students = {
    'AP-1024': { id: 'AP-1024', status: 'approved', className: 'দশম শ্রেণি', group: 'বিজ্ঞান বিভাগ' },
    'STU-10-ARTS': { id: 'STU-10-ARTS', status: 'approved', className: 'দশম শ্রেণি', group: 'মানবিক বিভাগ' },
    'STU-9-SCI': { id: 'STU-9-SCI', status: 'approved', className: 'নবম শ্রেণি', group: 'বিজ্ঞান বিভাগ' },
    'STU-PENDING': { id: 'STU-PENDING', status: 'pending', className: 'দশম শ্রেণি', group: 'বিজ্ঞান বিভাগ' }
  };

  const scienceNotice = normalizeNoticeRecord({
    id: 'ntc-sci-1',
    title: 'বিজ্ঞান বিভাগের ল্যাব ক্লাস',
    body: 'ল্যাব খাতা সাথে আনতে হবে।',
    classId: '10',
    group: 'Science',
    published: true
  });

  const initialFanout = buildNoticeFanout({
    noticeId: 'ntc-sci-1',
    after: scienceNotice,
    students
  });
  assert.ok(initialFanout['studentNotices/AP-1024/ntc-sci-1'], 'Class 10 Science approved student receives notice');
  assert.equal(initialFanout['studentNotices/STU-10-ARTS/ntc-sci-1'], undefined, 'Humanities student excluded');
  assert.equal(initialFanout['studentNotices/STU-9-SCI/ntc-sci-1'], undefined, 'Class 9 student excluded');
  assert.equal(initialFanout['studentNotices/STU-PENDING/ntc-sci-1'], undefined, 'Pending student excluded');

  // Re-scope notice from Science to Humanities: AP-1024 copy retracts (null), STU-10-ARTS receives copy.
  const rescoped = normalizeNoticeRecord({
    ...scienceNotice,
    group: 'মানবিক বিভাগ'
  });
  const rescopedFanout = buildNoticeFanout({
    noticeId: 'ntc-sci-1',
    before: scienceNotice,
    after: rescoped,
    students
  });
  assert.equal(rescopedFanout['studentNotices/AP-1024/ntc-sci-1'], null, 'previous recipient copy retracted');
  assert.ok(rescopedFanout['studentNotices/STU-10-ARTS/ntc-sci-1'], 'new recipient copy projected');

  // Global notice reaches all approved students with a class, never pending students.
  const globalNotice = normalizeNoticeRecord({
    id: 'ntc-global-1',
    title: 'ঈদের ছুটির নোটিশ',
    body: 'আগামী সপ্তাহে কোচিং বন্ধ থাকবে।',
    classId: '',
    group: '',
    published: true
  });
  assert.equal(noticeMatchesStudent(globalNotice, students['AP-1024']), true);
  assert.equal(noticeMatchesStudent(globalNotice, students['STU-9-SCI']), true);
  assert.equal(noticeMatchesStudent(globalNotice, students['STU-PENDING']), false);
  assert.deepEqual(
    Object.keys(buildStudentNoticeProjection({ 'ntc-global-1': globalNotice, 'ntc-arts': rescoped }, students['AP-1024'])),
    ['ntc-global-1']
  );
});

test('Teacher assignment check forbids global or unassigned notices, and draft publish guard prevents in-flight race loss', () => {
  const assignments = [
    { id: 'asg-1', teacherId: 'TCH-1', className: 'দশম শ্রেণি', group: 'বিজ্ঞান বিভাগ', subjects: ['গণিত'] }
  ];
  assert.equal(noticeMatchesTeacher({ classId: 'Class 10', group: 'বিজ্ঞান' }, 'TCH-1', assignments), true);
  assert.equal(noticeMatchesTeacher({ classId: '', group: '' }, 'TCH-1', assignments), false, 'Teacher cannot publish global unscoped notice');
  assert.equal(noticeMatchesTeacher({ classId: 'নবম শ্রেণি', group: 'বিজ্ঞান' }, 'TCH-1', assignments), false);

  const originalDraft = normalizeNoticeDraft({
    id: 'd-1',
    authorUid: 'u-tch',
    title: 'প্রথম খসড়া',
    body: 'মূল বার্তা',
    classId: 'দশম শ্রেণি',
    group: 'বিজ্ঞান',
    status: 'draft',
    published: false
  });
  assert.equal(
    advanceNoticeDraftAfterPublish({ ...originalDraft }, { authorUid: 'u-tch', noticeId: 'd-1', publishedDraft: originalDraft }),
    null,
    'unchanged draft is cleanly removed once promoted to canonical notices'
  );
  const editedInFlight = { ...originalDraft, body: 'প্রকাশের সময় শিক্ষক নতুন লাইন লিখেছেন' };
  assert.equal(
    advanceNoticeDraftAfterPublish(editedInFlight, { authorUid: 'u-tch', noticeId: 'd-1', publishedDraft: originalDraft }),
    undefined,
    'edited draft is preserved so the newer edit is not lost'
  );
});
