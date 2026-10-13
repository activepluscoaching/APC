import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { KEYS } from '../js/database.js';
import { preflightLedgerMigration } from '../tools/ledger-migration-preflight.mjs';

test('Admin export still produces the existing backup shape consumed by offline preflight', async t => {
  const ctx = await loadPage('admin.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  t.after(() => ctx.window.close());
  const roster = [{ id: 'OLD-01', name: 'Student One', className: 'দশম শ্রেণি', monthlyFee: 1500 }];
  const payments = [{ id: 'T-01', studentId: 'OLD-01', amount: 1500,
    receiptNo: 'C-2026-T-01', month: 'অক্টোবর ২০২৬', feeType: 'মাসিক বেতন',
    method: 'নগদ (Cash)', status: 'pending' }];
  ctx.window.localStorage.setItem(KEYS.students, JSON.stringify(roster));
  ctx.window.localStorage.setItem(KEYS.transactions, JSON.stringify(payments));
  ctx.window.localStorage.setItem(KEYS.account, JSON.stringify({ passwordHash: 'PRIVATE-HASH' }));
  await provisionStaff('admin'); seedStaffSession(ctx.window, 'admin');
  await import('../js/admin.js');
  await ctx.waitFor(() => ctx.$('#adminShell')?.hidden === false);
  const rosterBeforeExport = ctx.window.localStorage.getItem(KEYS.students);
  const paymentsBeforeExport = ctx.window.localStorage.getItem(KEYS.transactions);
  let exported, download;
  const originalGlobalURL = globalThis.URL;
  globalThis.URL = ctx.window.URL;
  t.after(() => { globalThis.URL = originalGlobalURL; });
  ctx.window.URL.createObjectURL = blob => { exported = blob; return 'blob:apc-test'; };
  ctx.window.URL.revokeObjectURL = () => {};
  const originalClick = ctx.window.HTMLAnchorElement.prototype.click;
  ctx.window.HTMLAnchorElement.prototype.click = function click() { download = this.download; };
  t.after(() => { ctx.window.HTMLAnchorElement.prototype.click = originalClick; });
  ctx.click(ctx.$('#backupExportButton'));
  await ctx.waitFor(() => Boolean(exported));
  const raw = await new Promise((resolve, reject) => {
    const reader = new ctx.window.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(exported);
  });
  const payload = JSON.parse(raw);
  assert.match(download, /^APC-backup-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(payload.kind, 'active-plus-backup');
  assert.equal(payload.version, 1);
  assert.equal(payload.data[KEYS.students], rosterBeforeExport);
  assert.equal(payload.data[KEYS.transactions], paymentsBeforeExport);
  assert.equal(payload.data[KEYS.account], undefined, 'do not export account password hashes');
  assert.equal(ctx.window.localStorage.getItem(KEYS.students), rosterBeforeExport);
  assert.equal(ctx.window.localStorage.getItem(KEYS.transactions), paymentsBeforeExport);
  const report = preflightLedgerMigration(payload, { kind: 'apc-reviewed-student-links', version: 1,
    links: [{ legacyStudentId: 'OLD-01', uid: 'UID-01' }] });
  assert.equal(report.importAllowed, false);
  assert.equal(JSON.stringify(report).includes('UID-01'), false);
});

test('backup allowlist stays limited to non-credential collections', () => {
  const source = readFileSync(new URL('../js/admin.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('const BACKUP_KEYS ='), source.indexOf('const bn ='));
  for (const name of ['students', 'transactions', 'notices', 'routine', 'teaching', 'exams', 'settings'])
    assert.match(block, new RegExp(`KEYS\\.${name}\\b`));
  for (const name of ['account', 'accounts', 'usernames', 'studentProfile'])
    assert.doesNotMatch(block, new RegExp(`KEYS\\.${name}\\b`));
});
