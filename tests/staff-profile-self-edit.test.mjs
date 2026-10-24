/* Issue 7 — placeholder names become real names, everywhere.
   Three legs, in the order a real device hits them:
     a) bootstrap accounts read in clean Bengali («প্রাথমিক শিক্ষক অ্যাকাউন্ট»),
        never with a glued English role word;
     b) an Admin rename of a SYSTEM record write-backs into the device role
        account — the name the person at the panel sees changes too;
     c) a Staff Directory teacher can be mirrored (self-edit path) — the
        directory record updates, and a username with no record reports
        found:false so the caller falls back to the device account. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { ensureBootstrapStaffAccounts, readStaffAccount } from '../js/staff-auth.js';
import { staffRoleNameBn } from '../js/staff-role-names.js';
import {
  createStaff, findDirectoryStaffByUsername, updateStaff, mirrorSelfProfileToDirectory, listStaff
} from '../js/staff-directory.js';

let ctx;

before(async () => {
  ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  await provisionStaff('admin');
  seedStaffSession(ctx.window, 'admin');
});
after(() => ctx?.window.close());

test('bootstrap placeholders are clean Bengali role names', async () => {
  const bootstrap = await ensureBootstrapStaffAccounts('admin.apc');
  assert.equal(bootstrap.ok, true, bootstrap.error || 'bootstrap created');
  for (const role of ['manager', 'teacher', 'payment']) {
    const account = await readStaffAccount(role);
    assert.ok(account, `${role} account exists`);
    assert.equal(account.fullName, `প্রাথমিক ${staffRoleNameBn(role)} অ্যাকাউন্ট`,
      `${role} placeholder is Bengali`);
    assert.doesNotMatch(account.fullName, /teacher|manager|payment|office/i,
      'no English role word glued into the visible name');
  }
  assert.equal(staffRoleNameBn('teacher'), 'শিক্ষক');
  assert.equal(staffRoleNameBn('manager'), 'ম্যানেজার');
});

test('an Admin rename of the system teacher record reaches the device account', async () => {
  const record = (await listStaff()).find(row => row.kind === 'system' && row.systemRole === 'teacher');
  assert.ok(record, 'the system teacher record exists');
  const result = await updateStaff(record.staffId, { fullName: 'Rahim Uddin', mobile: '01711000111' });
  assert.equal(result.ok, true, result.error || 'update stored');
  const account = await readStaffAccount('teacher');
  assert.equal(account.fullName, 'Rahim Uddin', 'the device account shows the new name');
  const seen = (await listStaff()).find(row => row.kind === 'system' && row.systemRole === 'teacher');
  assert.equal(seen.fullName, 'Rahim Uddin', "the Admin's list shows it too");
});

test('the self-edit mirror updates a directory teacher and reports misses', async () => {
  const created = await createStaff({
    fullName: 'Sadia Islam', role: 'teacher', status: 'active',
    mobile: '01711009902', email: 'sadia2@example.com', joiningDate: '2026-02-01',
    password: 'Sadia-2026', confirmPassword: 'Sadia-2026',
    assignment: { classes: [], subjects: [] }
  });
  assert.equal(created.ok, true, created.error);
  const username = created.staff.username;

  const patched = await mirrorSelfProfileToDirectory(username, { fullName: 'Sadia Rahman' });
  assert.equal(patched.found, true, 'the record exists');
  assert.equal(patched.mirrored, true, 'the rename was written');
  const back = await findDirectoryStaffByUsername(username);
  assert.equal(back.fullName, 'Sadia Rahman', 'the directory record shows the new name');

  const unchanged = await mirrorSelfProfileToDirectory(username, { fullName: 'Sadia Rahman' });
  assert.equal(unchanged.found, true, 'still found');
  assert.equal(unchanged.mirrored, false, 'an identical name writes nothing');

  const miss = await mirrorSelfProfileToDirectory('nobody.teacher.apc', { fullName: 'Ghost' });
  assert.equal(miss.found, false, 'no record — the caller falls back to the device account');
});
