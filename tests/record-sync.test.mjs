import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecordSync, mergeRecordOperations } from '../js/record-sync.js';

const clone = value => JSON.parse(JSON.stringify(value));
function device(cloud, initial = {}, disk = {}) {
  let local = clone(initial);
  let fail = false;
  let gate = null;
  const bridge = createRecordSync({
    loadState: () => disk.state,
    saveState: value => { disk.state = clone(value); },
    readLocal: () => local,
    writeLocal: value => { local = clone(value); },
    commit: async operations => {
      if (gate) await gate;
      if (fail) throw new Error('permission-denied');
      cloud.value = mergeRecordOperations(cloud.value, operations);
      return clone(cloud.value);
    }
  });
  return {
    bridge, disk,
    local: () => local,
    edit(value) { local = clone(value); bridge.capture(); },
    fail(value) { fail = value; },
    gate(value) { gate = value; }
  };
}

test('first sync fills missing records without overwriting an existing cloud record', async () => {
  const cloud = { value: { a: { text: 'cloud' }, b: { text: 'other device' } } };
  const d = device(cloud, { a: { text: 'old local' }, c: { text: 'never uploaded' } });
  d.bridge.receive(cloud.value);
  await d.bridge.flush();
  assert.deepEqual(d.local(), { ...cloud.value });
  assert.equal(cloud.value.a.text, 'cloud');
  assert.equal(cloud.value.c.text, 'never uploaded');
});

test('two devices changing different records preserve both changes', async () => {
  const cloud = { value: {} };
  const a = device(cloud), b = device(cloud);
  a.edit({ a: { amount: 500 } });
  b.edit({ b: { amount: 600 } });
  await Promise.all([a.bridge.flush(), b.bridge.flush()]);
  assert.deepEqual(cloud.value, { a: { amount: 500 }, b: { amount: 600 } });
});

test('failed writes and deletions survive restarting the browser outbox', async () => {
  const cloud = { value: { a: { text: 'before' }, b: { text: 'delete me' } } };
  const first = device(cloud);
  first.bridge.receive(cloud.value);
  first.edit({ a: { text: 'offline edit' } });
  first.fail(true);
  await assert.rejects(first.bridge.flush());
  const rebooted = device(cloud, first.local(), first.disk);
  rebooted.bridge.receive(cloud.value);
  assert.equal(rebooted.local().a.text, 'offline edit');
  assert.equal(rebooted.local().b, undefined);
  await rebooted.bridge.flush();
  assert.deepEqual(cloud.value, { a: { text: 'offline edit' } });
  assert.equal(rebooted.bridge.hasPending(), false);
});

test('empty remote snapshot clears previously synced records, without resurrection', async () => {
  const cloud = { value: { a: { text: 'old' } } };
  const d = device(cloud);
  d.bridge.receive(cloud.value);
  cloud.value = {};
  d.bridge.receive(cloud.value);
  assert.deepEqual(d.local(), {});
  const rebooted = device(cloud, d.local(), d.disk);
  await rebooted.bridge.flush();
  assert.deepEqual(cloud.value, {});
});

test('an edit made during an in-flight write is not discarded by its acknowledgement', async () => {
  const cloud = { value: {} }, d = device(cloud);
  let release;
  d.gate(new Promise(resolve => { release = resolve; }));
  d.edit({ a: { text: 'one' } });
  const flight = d.bridge.flush();
  d.edit({ a: { text: 'two' } });
  d.gate(null);
  release();
  await flight;
  assert.equal(cloud.value.a.text, 'two');
  assert.equal(d.bridge.hasPending(), false);
});

test('an older outbox state is discarded instead of inventing deletions', async () => {
  const cloud = { value: { a: { text: 'keep me' } } };
  const disk = { state: { version: 1, view: { a: { text: 'keep me' } }, pending: { a: { value: null } } } };
  const rebooted = device(cloud, {}, disk);   // the local file no longer holds that record
  rebooted.bridge.receive(cloud.value);
  await rebooted.bridge.flush();
  assert.deepEqual(cloud.value, { a: { text: 'keep me' } }, 'a stale delete request is not replayed');
  assert.deepEqual(rebooted.local(), { a: { text: 'keep me' } }, 'and the record is pulled back down');
});

test('the persisted outbox stores fingerprints, not a second copy of every record', async () => {
  const cloud = { value: {} };
  const big = { body: 'x'.repeat(4000) };
  const d = device(cloud, { A: big });
  await d.bridge.flush();
  const saved = JSON.stringify(d.disk.state);
  assert.ok(saved.length < 400, `outbox state stayed small (${saved.length} bytes)`);
  assert.equal(d.bridge.hasPending(), false);
  d.edit({ A: { body: 'changed' } });          // a real change is still detected
  await d.bridge.flush();
  assert.equal(cloud.value.A.body, 'changed');
});

/* ---- A stale phone copy must never undo a newer decision ----------------------
   The reported defect (2026-09-30): the Admin approves a registration, but the
   student's phone — which was closed (or offline) while the decision was made —
   still holds the old "pending" row. On the next boot that stale row was pushed
   back over the approval, so the student stayed locked out of the app. A queued
   local copy now loses to a strictly newer cloud copy. */

test('a stale local copy never overwrites a newer cloud record', async () => {
  const pendingRow = {
    id: 's260930001-abcd', name: 'নতুন শিক্ষার্থী', status: 'pending',
    registeredAt: '2026-09-30T04:00:00.000Z'
  };
  const approvedRow = {
    ...pendingRow, status: 'approved', reviewedAt: '2026-09-30T05:00:00.000Z',
    reviewedBy: 'office.admin.apc', reviewedRole: 'admin', updatedAt: '2026-09-30T05:00:00.000Z'
  };
  const cloud = { value: { [pendingRow.id]: pendingRow } };
  // The phone already synced the pending row, so its outbox knows that state.
  const phone = device(cloud, { [pendingRow.id]: pendingRow });
  phone.bridge.receive(cloud.value);
  await phone.bridge.flush();
  assert.equal(cloud.value[pendingRow.id].status, 'pending');

  // The office decides on another device…
  cloud.value = { [pendingRow.id]: approvedRow };
  // …while this phone is closed. On its next boot the schema migration rewrites
  // the stored row (a new field appears), which looks like a local change.
  const rebooted = device(cloud, { [pendingRow.id]: { ...pendingRow, email: '' } }, phone.disk);
  rebooted.bridge.receive(cloud.value);
  await rebooted.bridge.flush();

  assert.equal(cloud.value[pendingRow.id].status, 'approved', 'the decision survives the stale phone');
  assert.equal(rebooted.local()[pendingRow.id].status, 'approved', 'and the phone adopts it');
  assert.equal(rebooted.bridge.hasPending(), false, 'the stale queued copy is dropped');
});

test('a genuinely newer local edit still wins over an older cloud copy', async () => {
  const cloud = { value: { t1: { id: 't1', amount: 500, updatedAt: '2026-09-30T04:00:00.000Z' } } };
  const d = device(cloud, { t1: { id: 't1', amount: 500, updatedAt: '2026-09-30T04:00:00.000Z' } });
  d.bridge.receive(cloud.value);
  await d.bridge.flush();
  d.edit({ t1: { id: 't1', amount: 900, updatedAt: '2026-09-30T06:00:00.000Z' } });
  await d.bridge.flush();
  assert.equal(cloud.value.t1.amount, 900, 'an offline edit made after the cloud copy is kept');
});

test('an explicit local deletion is still applied', async () => {
  const cloud = { value: { t1: { id: 't1', amount: 500, updatedAt: '2026-09-30T04:00:00.000Z' } } };
  const d = device(cloud, { t1: { id: 't1', amount: 500, updatedAt: '2026-09-30T04:00:00.000Z' } });
  d.bridge.receive(cloud.value);
  await d.bridge.flush();
  cloud.value = { t1: { ...cloud.value.t1, updatedAt: '2026-09-30T06:00:00.000Z' } };
  d.edit({});
  await d.bridge.flush();
  assert.equal(cloud.value.t1, undefined, 'a deletion is a deliberate action, not a stale copy');
});

/* ---- Two offices deciding the same registration from two devices -------------
   Admin and Manager may both decide a registration (js/registration-review.js),
   and every device works offline-first. The registration is one roster row, so
   two decisions merge into that row by `updatedAt`: two devices that agree keep
   the one outcome, and when two devices decide differently the later decision
   is what every device ends up showing — in whichever order the two writes
   reach the cloud. */

const pendingRow = {
  id: 's260930002-efgh', name: 'নতুন শিক্ষার্থী', status: 'pending',
  registeredAt: '2026-09-30T04:00:00.000Z'
};
const decided = (status, at, role) => ({
  ...pendingRow, status, reviewedAt: at, updatedAt: at, reviewedRole: role
});

test('two devices approving the same registration keep one approved row', async () => {
  const cloud = { value: { [pendingRow.id]: pendingRow } };
  const phone = device(cloud, { [pendingRow.id]: pendingRow });
  const office = device(cloud, { [pendingRow.id]: pendingRow });
  phone.bridge.receive(cloud.value);
  office.bridge.receive(cloud.value);

  phone.edit({ [pendingRow.id]: decided('approved', '2026-09-30T05:00:00.000Z', 'manager') });
  office.edit({ [pendingRow.id]: decided('approved', '2026-09-30T05:00:20.000Z', 'admin') });
  await Promise.all([phone.bridge.flush(), office.bridge.flush()]);

  assert.equal(Object.keys(cloud.value).length, 1, 'the registration never duplicates');
  assert.equal(cloud.value[pendingRow.id].status, 'approved');
  assert.equal(phone.local()[pendingRow.id].status, 'approved', 'both devices show the approval');
  assert.equal(office.local()[pendingRow.id].status, 'approved');
});

test('when two devices decide differently, the later decision is the one kept', async () => {
  for (const officeFirst of [false, true]) {
    const cloud = { value: { [pendingRow.id]: pendingRow } };
    const approver = device(cloud, { [pendingRow.id]: pendingRow });
    const rejecter = device(cloud, { [pendingRow.id]: pendingRow });
    approver.bridge.receive(cloud.value);
    rejecter.bridge.receive(cloud.value);

    approver.edit({ [pendingRow.id]: decided('approved', '2026-09-30T05:00:00.000Z', 'manager') });
    rejecter.edit({ [pendingRow.id]: decided('rejected', '2026-09-30T06:00:00.000Z', 'admin') });
    const writes = officeFirst
      ? [rejecter.bridge.flush(), approver.bridge.flush()]
      : [approver.bridge.flush(), rejecter.bridge.flush()];
    await Promise.all(writes);

    assert.equal(cloud.value[pendingRow.id].status, 'rejected',
      'the newer decision wins whichever write lands first');
    // Every device follows the cloud snapshot (js/realtime-sync.js listens on
    // the roster node), so the earlier decision is replaced on its own screen.
    approver.bridge.receive(cloud.value);
    rejecter.bridge.receive(cloud.value);
    assert.equal(approver.local()[pendingRow.id].status, 'rejected',
      'the earlier device adopts the newer decision');
    assert.equal(rejecter.local()[pendingRow.id].status, 'rejected');
  }
});
