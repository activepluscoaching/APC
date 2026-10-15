/* Student panel separation — the student app has its own page, like every
   other portal (owner decision 2026-10-14). index.html is only the login
   door now: it must not ship the signed-in app at all, student.html must
   ship nothing else, and the two pages hand over to each other exactly like
   a staff sign-in hands over to its panel:
     • a verified student session on the login page continues to student.html,
     • student.html without a session goes straight back to the login door,
     • the service worker precaches both pages. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { loadPage } from './jsdom-harness.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const documentOf = file => new JSDOM(read(file)).window.document;

test('index.html ships only the login door, student.html only the panel', () => {
  const login = documentOf('index.html');
  assert.ok(login.getElementById('authScreen'), 'the login screen stays on index.html');
  assert.ok(login.getElementById('loginForm'), 'the login form stays on index.html');
  assert.ok(login.getElementById('registrationForm'), 'registration stays on index.html');
  assert.ok(login.getElementById('recoveryModal'), 'password recovery stays on index.html');
  assert.equal(login.getElementById('appShell'), null, 'the signed-in shell must not ship on the login page');
  assert.equal(login.querySelectorAll('[data-view-panel]').length, 0, 'no student view ships on the login page');

  const panel = documentOf('student.html');
  assert.ok(panel.getElementById('appShell'), 'the student shell ships on student.html');
  assert.equal(panel.getElementById('appShell').hidden, true, 'the shell starts hidden, before any session check');
  assert.equal(panel.querySelectorAll('[data-view-panel]').length, 50, 'every student view ships on the panel page');
  assert.ok(panel.getElementById('noticeModal') && panel.getElementById('logoutModal') && panel.getElementById('editModal'),
    'the panel overlays ship with the panel');
  assert.equal(panel.getElementById('authScreen'), null, 'the login screen must not ship on the panel page');
  assert.equal(panel.getElementById('loginForm'), null, 'no login form on the panel page');
});

test('both pages are precached and the entry map knows the student door', () => {
  const sw = read('sw.js');
  assert.ok(sw.includes("'./index.html'"), 'the login page is precached');
  assert.ok(sw.includes("'./student.html'"), 'the student panel page is precached');
  assert.match(read('js/app-entry.js'), /student:\s*'\.\/main\.js'/, 'the entry map still routes the student panel to main.js');
  assert.match(read('js/main.js'), /window\.location\.assign\(`\$\{STUDENT_PANEL_URL\}/, 'login hands the student to the panel page');
  assert.match(read('js/main.js'), /window\.location\.replace\('index\.html'\)/, 'the panel hands a signed-out visitor back to the login door');
});

/* Boot one page the way the phone does: the signed-in records are sealed
   against this page's own device storage, so they are written after the
   page exists, then the real entry module runs (student-page.test pattern). */
async function bootSignedIn(file, tag) {
  const ctx = await loadPage(file, { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  const { hashPassword } = await import('../js/password-hash.js');
  const { buildSessionRecord } = await import('../js/session.js');
  ctx.window.localStorage.setItem('active-plus-account-v1', JSON.stringify({
    mobile: '01700000000', registrationMobile: '01700000000', username: 'separation.student',
    pinHash: await hashPassword('246810'), status: 'active',
    student: { id: 'AP-SEP', name: 'বিচ্ছিন্ন শিক্ষার্থী', className: 'দশম শ্রেণি', group: 'A' }
  }));
  ctx.window.localStorage.setItem('active-plus-session-v1',
    JSON.stringify(buildSessionRecord({ owner: 'separation.student' })));
  await import(`../js/main.js?${tag}=${Math.random()}`);
  return ctx;
}

const navigated = ctx => ctx.jsdomErrors.some(error => /navigation/i.test(error));

test('a verified session on the login page is handed to student.html', async () => {
  const ctx = await bootSignedIn('index.html', 'separation-login');
  await ctx.waitFor(() => navigated(ctx));
  assert.equal(ctx.$('#appShell'), null, 'the panel never renders on the login page');
  ctx.window.close();
});

test('student.html without a session goes back to the login door', async () => {
  const ctx = await loadPage('student.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  await import(`../js/main.js?separation-anon=${Math.random()}`);
  await ctx.waitFor(() => navigated(ctx));
  assert.equal(ctx.$('#appShell').hidden, true, 'the shell never opens without a session');
  ctx.window.close();
});

test('student.html with a verified session opens the panel', async () => {
  const ctx = await bootSignedIn('student.html', 'separation-panel');
  await ctx.waitFor(() => ctx.$('#appShell').hidden === false);
  assert.equal(ctx.$('#authScreen'), null, 'no login screen is painted inside the panel');
  assert.deepEqual(ctx.jsdomErrors.filter(error => !/navigation/i.test(error)), [], 'no page errors while the panel opens');
  ctx.window.close();
});
