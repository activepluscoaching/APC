/* Super Admin access (owner decision 2026-10-16): the signed-in Admin holds
   full control, so one Admin login opens every staff portal on the device —
   Manager, Teacher and the Payment counter — with no second login and no
   other role's account record needed.
 *
 * The borrow is one-way and session-real:
 *   • hasStaffSession('manager'|'teacher'|'payment') answers true under a
 *     valid Admin session, and false again the moment that session ends.
 *   • No other role's session borrows back: a Manager (or Teacher, or
 *     Payment) session never opens the Admin panel.
 *   • activeStaffRoles() still reports only the role that actually signed
 *     in, so the login router and lock cards never claim every panel is
 *     "signed in".
 *   • The panel guard lets the Admin cross between portals, and still
 *     refuses every other signed-in role.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { hasStaffSession, isSuperAdminSession, activeStaffRoles, clearStaffSession } from '../js/staff-auth.js';
import { installPanelGuard } from '../js/panel-lockdown.js';

const DEMO_OFF = { 'activePlus.demo.autofill.v1': 'off' };
const IDENTITY_KEY = 'activePlus.activeStaffIdentity.v1';

test('the Admin session answers for every staff role, and only while it lives', async () => {
  const ctx = await loadPage('admin.html', { seed: DEMO_OFF });
  await provisionStaff('admin');

  for (const role of ['admin', 'manager', 'teacher', 'payment']) {
    assert.equal(await hasStaffSession(role), false, `${role} starts signed out`);
  }
  seedStaffSession(ctx.window, 'admin');

  assert.equal(await isSuperAdminSession(), true);
  for (const role of ['manager', 'teacher', 'payment']) {
    assert.equal(await hasStaffSession(role), true, `Super Admin opens ${role}`);
  }
  // The person who signed in is still reported as exactly one role.
  assert.deepEqual(await activeStaffRoles(), ['admin']);

  clearStaffSession('admin');
  assert.equal(await isSuperAdminSession(), false);
  for (const role of ['manager', 'teacher', 'payment']) {
    assert.equal(await hasStaffSession(role), false, `${role} closes with the Admin session`);
  }
  ctx.window.close();
});

test('no other role borrows back into the Admin panel', async () => {
  const ctx = await loadPage('admin.html', { seed: DEMO_OFF });
  await provisionStaff('manager');
  seedStaffSession(ctx.window, 'manager');

  assert.equal(await hasStaffSession('manager'), true);
  assert.equal(await isSuperAdminSession(), false);
  assert.equal(await hasStaffSession('admin'), false, 'a Manager session never opens Admin');
  assert.equal(await hasStaffSession('teacher'), false, 'a Manager session opens no other portal either');
  ctx.window.close();
});

for (const [file, script, shellId] of [
  ['manager.html', '../js/manager.js', '#managerShell'],
  ['teacher.html', '../js/teacher.js', '#teacherShell'],
  ['payment.html', '../js/payment.js', '#payShell']
]) {
  test(`${file} opens on the Admin session alone`, async () => {
    const ctx = await loadPage(file, { seed: DEMO_OFF });
    await provisionStaff('admin');
    seedStaffSession(ctx.window, 'admin');
    await import(`${script}?super-admin=${file}`);
    await ctx.waitFor(() => ctx.$(shellId).hidden === false);
    assert.equal(ctx.$('#apcPanelLock'), null, 'no lock card for the Super Admin');
    // Let the panel's first data load settle before the page goes away.
    await ctx.flush();
    await new Promise(resolve => setTimeout(resolve, 120));
    ctx.window.close();
  });
}

test('the panel guard lets the Admin cross, and still refuses a Manager', async () => {
  const ctx = await loadPage('manager.html', { seed: DEMO_OFF });

  // A Manager identity: crossing into the Admin panel is refused.
  ctx.window.localStorage.setItem(IDENTITY_KEY, JSON.stringify({ username: 'manager.apc', role: 'manager' }));
  let guard = installPanelGuard({ own: 'manager.html', notify: () => {} });
  const blockedLink = ctx.document.createElement('a');
  blockedLink.href = './admin.html';
  ctx.document.body.append(blockedLink);
  ctx.click(blockedLink);
  assert.deepEqual(guard.blocked, ['admin.html'], 'the Manager click was refused');
  guard.uninstall();

  // The Admin identity: the same door is a normal navigation.
  ctx.window.localStorage.setItem(IDENTITY_KEY, JSON.stringify({ username: 'admin.apc', role: 'admin' }));
  guard = installPanelGuard({ own: 'admin.html', notify: () => {} });
  const door = ctx.document.createElement('a');
  door.href = './teacher.html';
  ctx.document.body.append(door);
  ctx.click(door);
  assert.deepEqual(guard.blocked, [], 'the Super Admin door was not refused');
  guard.uninstall();
  ctx.window.close();
});
