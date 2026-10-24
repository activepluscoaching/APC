import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { EXAM_KEY, examTemplate, validateExam } from '../js/exam-data.js';
import { STORAGE_KEYS } from '../js/config.js';

test('live exam hub uses scoped published papers and the existing start/resume workflow', async () => {
  const now = Date.now();
  const student = { id: 'EX-HUB-STUDENT', name: 'শিক্ষার্থী', className: 'দশম শ্রেণি', group: '' };
  const exam = {
    ...validateExam({ type: 'mcq', title: 'বিজ্ঞান মডেল টেস্ট', subject: 'গণিত', className: student.className,
      startAt: now - 60000, endAt: now + 30 * 60000, lateMinutes: 10,
      negative: 0, passPercent: 33, template: examTemplate('mcq') }),
    id: 'EX-HUB-LIVE', teacherId: 'TCH-1', teacherName: 'শিক্ষক', status: 'published',
    publishedAt: now - 60000, createdAt: now - 60000, updatedAt: now, participants: [student]
  };
  const ctx = await loadPage('student.html', { seed: {
    'activePlus.demo.autofill.v1': 'off',
    [STORAGE_KEYS.account]: JSON.stringify({ status: 'active', student })
  } });
  try {
    ctx.window.sessionStorage.setItem(STORAGE_KEYS.session, '1');
    ctx.window.localStorage.setItem(EXAM_KEY, JSON.stringify({ version: 1, exams: [exam,
      { ...exam, id: 'DRAFT', status: 'draft' },
      { ...exam, id: 'FUTURE', startAt: now + 600000 },
      { ...exam, id: 'CLOSED', startAt: now - 3600000, endAt: now - 1 }
    ], attempts: [] }));
    ctx.window.HTMLElement.prototype.scrollIntoView = function () {};
    const { initStudentExams } = await import('../js/student-exams.js?hub-reference');
    const api = initStudentExams({ getStudent: () => student, getAccount: () => ({ status: 'active' }) });
    await api();
    assert.equal(ctx.$$('#examHubLiveList [data-live-exam]').length, 1);
    assert.match(ctx.$('#examHubLiveList').textContent, /বিজ্ঞান মডেল টেস্ট/);
    assert.match(ctx.$('#examHubLiveList').textContent, /৩০ মিনিট বাকি/);
    const start = ctx.$('[data-exam-hub-open]');
    assert.equal(start.textContent, 'শুরু');
    ctx.click(start);
    await ctx.waitFor(() => Boolean(ctx.$('.exam-question-list')));
    const saved = JSON.parse(ctx.window.localStorage.getItem(EXAM_KEY));
    assert.equal(saved.attempts[0].examId, exam.id);
    assert.equal(saved.attempts[0].status, 'active');
    ctx.click(ctx.$('[data-student-exam-action="list"]'));
    await api();
    assert.equal(ctx.$('[data-exam-hub-open]').textContent, 'ফিরে যান');
  } finally { ctx.window.close(); }
});
