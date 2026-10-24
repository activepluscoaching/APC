import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { preflightLedgerMigration, PreflightInputError } from '../tools/ledger-migration-preflight.mjs';
const STUDENTS = 'activePlus.admin.students.v1';
const TRANSACTIONS = 'activePlus.admin.transactions.v1';
const backup = (students, transactions) => ({ kind: 'active-plus-backup', version: 1,
  createdAt: '2026-10-13T10:00:00Z', data: {
    [STUDENTS]: JSON.stringify(students), [TRANSACTIONS]: JSON.stringify(transactions),
    'active-plus-account-v1': JSON.stringify({ passwordHash: 'PRIVATE-HASH', mobile: '01700000000' })
  } });
const student = (id = 'OLD-01') => ({ id, name: 'Private Name', mobile: '01799999999',
  guardianMobile: '01888888888', className: 'দশম শ্রেণি', monthlyFee: 1500 });
const transaction = (id = 'T-01', changes = {}) => ({ id, studentId: 'OLD-01', receiptNo: `C-2026-${id}`,
  amount: 1500, feeType: 'মাসিক বেতন', month: 'অক্টোবর ২০২৬', method: 'নগদ (Cash)',
  status: 'approved', reviewedBy: 'Private Manager', reviewHistory: [{ decision: 'approved' }], ...changes });
const links = (rows = [{ legacyStudentId: 'OLD-01', uid: 'UID-SECRET-1' }]) => ({
  kind: 'apc-reviewed-student-links', version: 1, links: rows
});
const tool = new URL('../tools/ledger-migration-preflight.mjs', import.meta.url);

test('real Admin-backup raw-string collections and explicit one-to-one links yield only a sanitized inventory', () => {
  const input = backup([student()], [transaction()]);
  const before = JSON.stringify(input);
  const result = preflightLedgerMigration(input, links());
  assert.equal(result.cleanInventory, true);
  assert.equal(result.importAllowed, false, 'a clean inventory never proves Auth ownership or authorizes an import');
  assert.equal(result.blockerTotal, 0);
  assert.deepEqual(result.counts.statuses, { pending: 0, approved: 1, rejected: 0, absent: 0, invalid: 0 });
  assert.equal(JSON.stringify(input), before, 'read-only');
  for (const sensitive of ['OLD-01', 'UID-SECRET-1', 'Private Name', '01799999999', 'PRIVATE-HASH', 'T-01']) {
    assert.equal(JSON.stringify(result).includes(sensitive), false, `report must not reveal ${sensitive}`);
  }
});

test('missing or ambiguous links, duplicate IDs and orphan rows block without guessing by mobile', () => {
  const records = backup([student(), student('OLD-02'), student('OLD-02')], [
    transaction(), transaction('T-02', { studentId: 'MISSING', receiptNo: 'C-2026-T-01' }), transaction('T-01')
  ]);
  const reviewed = links([
    { legacyStudentId: 'OLD-01', uid: 'UID-A' },
    { legacyStudentId: 'OLD-01', uid: 'UID-B' },
    { legacyStudentId: 'OLD-02', uid: 'UID-A' },
    { legacyStudentId: 'UNKNOWN', uid: 'UID-C' }
  ]);
  const report = preflightLedgerMigration(records, reviewed);
  assert.equal(report.importAllowed, false);
  for (const code of ['studentIdDuplicate', 'mappingLegacyIdDuplicate', 'mappingUidDuplicate',
    'mappingOrphan', 'transactionStudentOrphan', 'transactionIdDuplicate', 'receiptNumberDuplicate']) {
    assert.ok(report.blockers[code] >= 1, code);
  }
  assert.equal(JSON.stringify(report).includes('UID-A'), false);
  assert.equal(preflightLedgerMigration(backup([student()], [transaction()]), links([])).blockers.mappingMissing, 1);
});

test('no default fee, rounding, implicit approval or trusted payment reference is invented', () => {
  const snapshot = backup([{ ...student(), monthlyFee: null }], [
    transaction('T-01', { amount: 12.5, status: undefined, reviewedBy: undefined, reviewHistory: undefined }),
    transaction('T-02', { method: 'বিকাশ (bKash)', trxRef: 'SameRef', amount: 700 }),
    transaction('T-03', { method: 'বিকাশ (bKash)', trxRef: 'sameref', amount: 700 }),
    transaction('T-04', { month: '2026-10', feeType: 'Other', method: 'fake', amount: -1 })
  ]);
  const report = preflightLedgerMigration(snapshot, links());
  for (const code of ['monthlyFeeMissing', 'amountRequiresReview', 'reviewStatusAbsent',
    'processorReferenceDuplicate', 'monthInvalid', 'feeTypeInvalid', 'paymentMethodInvalid']) {
    assert.ok(report.blockers[code] >= 1, code);
  }
  assert.equal(report.counts.statuses.absent, 1);
  assert.equal(report.importAllowed, false);
});

test('malformed shape, missing required collection or unreviewed mapping document is rejected generically', () => {
  for (const [source, map] of [
    [{ kind: 'something-else', data: {} }, links()],
    [backup([student()], [transaction()]), { links: [{ legacyStudentId: 'OLD-01', uid: 'UID' }] }],
    [{ kind: 'active-plus-backup', version: 1, data: { [STUDENTS]: '[]' } }, links()],
    [backup([student()], [transaction()]), links('not an array')],
    [backup([student()], [transaction()]), links(Array.from({ length: 100001 }, () => ({})))]
  ]) assert.throws(() => preflightLedgerMigration(source, map), PreflightInputError);
  assert.ok(preflightLedgerMigration(backup([student()], [{ id: 'x' }]), links()).blockerTotal > 0);
});

test('offline CLI outputs only counts and blocker codes; exit status is not an import permission', t => {
  const dir = mkdtempSync(join(tmpdir(), 'apc-ledger-preflight-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const back = join(dir, 'backup.json'), map = join(dir, 'links.json');
  const run = () => spawnSync(process.execPath, [tool.pathname, '--backup', back, '--links', map], {
    encoding: 'utf8', timeout: 5000
  });
  writeFileSync(back, JSON.stringify(backup([student()], [transaction()])));
  writeFileSync(map, JSON.stringify(links()));
  const clean = run();
  assert.equal(clean.status, 0);
  assert.equal(JSON.parse(clean.stdout).importAllowed, false);
  assert.equal(clean.stdout.includes('PRIVATE-HASH'), false);
  assert.equal(clean.stdout.includes('UID-SECRET-1'), false);
  writeFileSync(back, JSON.stringify(backup([student()], [transaction('T-01', { amount: 10.5 })])));
  const blocked = run();
  assert.equal(blocked.status, 2);
  assert.equal(JSON.parse(blocked.stdout).blockers.amountRequiresReview, 1);
  writeFileSync(back, 'PRIVATE-HASH invalid json');
  const invalid = run();
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert.equal(invalid.stderr.includes('PRIVATE-HASH'), false, 'do not echo parser errors/backup contents');
});
