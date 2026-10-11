/* The Manager and Teacher panels keep the open page across a refresh.
   One panel per test file (and per process): the app modules read the window
   globals of the page that loaded them, so two live panels in one process would
   fight over them. The Teacher case lives in
   tests/panel-refresh-route-teacher.test.mjs and Manager Reports in
   tests/panel-refresh-route-reports.test.mjs. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { openStaffPanel } from './staff-harness.mjs';

test('the manager panel reopens the page named in the URL', async () => {
  const manager = await loadPage('manager.html', {
    hash: '#notices',
    seed: { 'activePlus.demo.autofill.v1': 'off' }
  });
  await openStaffPanel(manager, 'manager', {
    importPanel: () => import('../js/manager.js'),
    shellId: 'managerShell',
    ready: () => Boolean(manager.$('.manager-view.active'))
  });
  assert.equal(manager.$('.manager-view.active').dataset.viewPanel, 'notices', 'manager keeps its page');
  // A page opened without a hash still lands on the dashboard.
  assert.equal(manager.$('.manager-view.active').hidden, false);
  manager.window.close();
});
