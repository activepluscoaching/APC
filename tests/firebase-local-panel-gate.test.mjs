import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';

// Exercise the same browser tab so opt-in cannot consume existing local sessions.
test('Firebase opt-in rejects local sessions, login and registration without deleting fallback data', async () => {
  const ctx = await loadPage('index.html');
  const storage = await import('../js/storage.js');
  const staff = await import('../js/staff-auth.js');
  const { initLogin } = await import('../js/login.js');
  const { initRegister } = await import('../js/register.js');
  assert.equal(await storage.persistSession(false), true);
  assert.equal(await staff.saveStaffSession('admin', false), true);
  assert.equal(await storage.hasSession(), true);
  assert.equal(await staff.hasStaffSession('admin'), true);
  const before = { ...ctx.window.localStorage };
  let admitted = 0;
  let registered = 0;
  initLogin({ state: { account: null }, onAuthenticated: () => { admitted++; } });
  initRegister({ state: { account: null, student: {} }, onRegistered: () => { registered++; } });

  ctx.window.history.replaceState({}, '', '/?backend=firebase');
  assert.equal(await storage.hasSession(), false);
  assert.equal(await staff.hasStaffSession('admin'), false);
  ctx.type(ctx.$('#loginMobile'), 'admin.apc');
  ctx.type(ctx.$('#loginPin'), 'local-password');
  ctx.submit(ctx.$('#loginForm'));
  await ctx.flush();
  assert.equal(admitted, 0);
  assert.match(ctx.$('#authMessage').textContent, /Firebase প্যানেল বন্ধ/);
  ctx.submit(ctx.$('#registrationForm'));
  await ctx.flush();
  assert.equal(registered, 0);
  assert.match(ctx.$('#authMessage').textContent, /Firebase নিবন্ধন বন্ধ/);
  assert.deepEqual({ ...ctx.window.localStorage }, before);

  ctx.window.history.replaceState({}, '', '/?backend=local');
  assert.equal(await storage.hasSession(), true);
  assert.equal(await staff.hasStaffSession('admin'), true);
  ctx.window.close();
});
