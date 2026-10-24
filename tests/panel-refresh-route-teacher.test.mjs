/* The Teacher panel keeps the open page across a refresh (own file: the app
   modules bind to the window globals of the page that loaded them). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { openStaffPanel } from './staff-harness.mjs';

test('the teacher panel reopens the page named in the URL', async () => {
  const teacher = await loadPage('teacher.html', {
    hash: '#profile',
    seed: { 'activePlus.demo.autofill.v1': 'off' }
  });
  await openStaffPanel(teacher, 'teacher', {
    importPanel: () => import('../js/teacher.js'),
    shellId: 'teacherShell',
    ready: () => teacher.$('#teacherShell').hidden === false
  });
  await teacher.waitFor(() => teacher.$('#teacherProfile')?.hidden === false);
  assert.equal(teacher.$('#teacherProfile').hidden, false, 'teacher keeps its page');
  await teacher.flush(10);
  teacher.window.close();
});
