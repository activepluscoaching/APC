import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compareLedgerBackups } from '../tools/ledger-backup-compare.mjs';
import { PreflightInputError } from '../tools/ledger-migration-preflight.mjs';
const S = 'activePlus.admin.students.v1';
const T = 'activePlus.admin.transactions.v1';
const student = (id = 'SECRET-S1', rest = {}) => ({ id, name: 'PRIVATE Person', mobile: '01700000000', monthlyFee: 1200, ...rest });
const payment = (id = 'SECRET-T1', rest = {}) => ({ id, studentId: 'SECRET-S1', receiptNo: 'SECRET-RECEIPT', amount: 1200, method: 'নগদ (Cash)', ...rest });
const backup = (students = [student()], transactions = [payment()], createdAt = '2026-10-13T10:00:00.000Z') => ({
  kind: 'active-plus-backup', version: 1, createdAt, data: {
    [S]: JSON.stringify(students), [T]: JSON.stringify(transactions),
    'private-credentials': JSON.stringify({ passwordHash: 'SECRET-HASH' })
  }
});
const tool = new URL('../tools/ledger-backup-compare.mjs', import.meta.url);
const containsPrivate = output => {
  for (const term of ['SECRET-S1', 'SECRET-S2', 'SECRET-T1', 'SECRET-T2', 'SECRET-RECEIPT',
    'PRIVATE Person', '01700000000', 'SECRET-HASH', 'REF-PRIVATE', '1200']) {
    assert.equal(output.includes(term), false, `must not disclose ${term}`);
  }
};

test('clean identical snapshots ignore field order and backup timestamps, but never authorize import', () => {
  const a = backup();
  const b = backup([{ mobile: '01700000000', monthlyFee: 1200, name: 'PRIVATE Person', id: 'SECRET-S1' }],
    [{ amount: 1200, receiptNo: 'SECRET-RECEIPT', method: 'নগদ (Cash)', id: 'SECRET-T1', studentId: 'SECRET-S1' }], '2025-01-01T00:00:00Z');
  const before = JSON.stringify([a, b]);
  const report = compareLedgerBackups([a, b]);
  assert.equal(report.cleanComparison, true);
  assert.equal(report.blockerTotal, 0);
  assert.equal(report.importAllowed, false);
  assert.equal(report.sourceCompletenessVerified, false);
  assert.equal(report.mergePerformed, false);
  assert.deepEqual(report.counts, { backups: 2, studentsDistinct: 1, transactionsDistinct: 1 });
  assert.equal(JSON.stringify([a, b]), before, 'no mutation');
  containsPrivate(JSON.stringify(report));
});

test('same IDs with different content conflict even if newest timestamp looks authoritative', () => {
  const older = backup();
  const newer = backup([student('SECRET-S1', { monthlyFee: 1300 })],
    [payment('SECRET-T1', { amount: 1300 })], '2027-10-13T10:00:00Z');
  const report = compareLedgerBackups([older, newer]);
  assert.equal(report.blockers.studentConflict, 1);
  assert.equal(report.blockers.transactionConflict, 1);
  assert.equal(report.cleanComparison, false);
  assert.equal(report.importAllowed, false);
  containsPrivate(JSON.stringify(report));
});

test('missing records across four backups are coverage gaps, NOT deletion evidence or a union operation', () => {
  const a = backup();
  const b = backup([], []);
  const c = backup([student()], [payment()]);
  const d = backup([], []);
  const report = compareLedgerBackups([a, b, c, d]);
  assert.equal(report.blockers.studentCoverageGap, 1);
  assert.equal(report.blockers.transactionCoverageGap, 1);
  assert.equal(report.counts.backups, 4);
  assert.equal(report.importAllowed, false);
  assert.equal(report.mergePerformed, false);
  containsPrivate(JSON.stringify(report));
});

test('different IDs reusing receipt or case-insensitive (method, reference) trigger separate blockers', () => {
  const b1 = backup([student()], [payment('SECRET-T1', { method: 'বিকাশ (bKash)', trxRef: 'REF-PRIVATE' })]);
  const b2 = backup([student()], [payment('SECRET-T2', { method: 'বিকাশ (bKash)', trxRef: 'ref-private' })]);
  const report = compareLedgerBackups([b1, b2]);
  assert.equal(report.blockers.receiptNumberCollision, 1);
  assert.equal(report.blockers.processorReferenceCollision, 1);
  assert.equal(report.blockers.transactionCoverageGap, 2);
  containsPrivate(JSON.stringify(report));
});

test('within-snapshot duplicates, invalid IDs/methods/references and invalid timestamps block', () => {
  const a = backup([student(), student(), { id: '__proto__' }],
    [payment(), payment(), payment('SECRET-T2', { method: 'unknown', trxRef: 'REF-PRIVATE' }),
      { id: 'bad id' }], 'unknown-SECRET-HASH');
  const report = compareLedgerBackups([a, backup()]);
  for (const code of ['studentIdDuplicateWithinBackup', 'studentIdInvalid',
    'transactionIdDuplicateWithinBackup', 'transactionIdInvalid',
    'paymentMethodInvalid', 'backupTimestampInvalid']) assert.ok(report.blockers[code] >= 1, code);
  assert.equal(report.importAllowed, false);
  containsPrivate(JSON.stringify(report));
  const missing = compareLedgerBackups([backup(), backup([student()], [payment('SECRET-T1', { method: 'বিকাশ (bKash)' })])]);
  assert.equal(missing.blockers.processorReferenceInvalid, 1);
  const rollover = compareLedgerBackups([backup(), backup([student()], [payment()], '2026-02-30T10:00:00Z')]);
  assert.equal(rollover.blockers.backupTimestampInvalid, 1, 'calendar rollover is not a valid timestamp');
});

test('invalid input and raw-string limits reject generically rather than echoing input', () => {
  for (const pair of [[], [backup()], Array.from({ length: 5 }, () => backup()),
    [backup(), { ...backup(), version: 2 }],
    [backup(), { ...backup(), data: { [S]: [], [T]: '[]' } }],
    [backup(), { ...backup(), data: { [S]: '[]', [T]: 'SECRET-HASH' } }],
    [backup(), { ...backup(), data: { [S]: JSON.stringify(Array.from({ length: 100001 }, () => ({}))), [T]: '[]' } }]
  ]) assert.throws(() => compareLedgerBackups(pair), PreflightInputError);
});

test('offline CLI: two-to-four --backup only, safe stdout and stderr; statuses 0/2/1', t => {
  const dir = mkdtempSync(join(tmpdir(), 'apc-ledger-backup-compare-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const pathA = join(dir, 'SECRET-HASH-a.json'), pathB = join(dir, 'SECRET-HASH-b.json');
  const run = (...args) => spawnSync(process.execPath, [tool.pathname, ...args], { encoding: 'utf8', timeout: 6000 });
  writeFileSync(pathA, JSON.stringify(backup()));
  writeFileSync(pathB, JSON.stringify(backup()));
  const clean = run('--backup', pathA, '--backup', pathB);
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(JSON.parse(clean.stdout).importAllowed, false);
  containsPrivate(clean.stdout + clean.stderr);
  writeFileSync(pathB, JSON.stringify(backup([], [])));
  const blocked = run('--backup', pathA, '--backup', pathB);
  assert.equal(blocked.status, 2, blocked.stderr);
  assert.equal(JSON.parse(blocked.stdout).blockers.transactionCoverageGap, 1);
  containsPrivate(blocked.stdout + blocked.stderr);
  writeFileSync(pathB, 'SECRET-HASH invalid JSON');
  for (const invalid of [run('--backup', pathA, '--backup', pathB), run('--backup', pathA), run('--links', pathA, '--backup', pathB)]) {
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, '');
    containsPrivate(invalid.stderr);
  }
});
