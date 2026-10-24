import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBackups } from '../js/backup-merge.js';

const backup = (createdAt, data) => ({ kind: 'active-plus-backup', version: 1, createdAt, data });
const KEYS = {
  students: 'activePlus.admin.students.v1',
  routine: 'activePlus.admin.routine.v1',
  teaching: 'activePlus.teaching.v1'
};

test('records missing on one device are kept from the other', () => {
  const a = backup('2026-09-20T00:00:00Z', { [KEYS.students]: JSON.stringify([{ id: 'S1', name: 'A' }]) });
  const b = backup('2026-09-29T00:00:00Z', { [KEYS.students]: JSON.stringify([{ id: 'S2', name: 'B' }]) });
  const { merged, report } = mergeBackups(a, b);
  assert.deepEqual(JSON.parse(merged.data[KEYS.students]).map(item => item.id).sort(), ['S1', 'S2']);
  assert.equal(report.counts['only-older'], 1);
  assert.equal(report.counts['only-newer'], 1);
});

test('a conflicting record keeps the newer timestamp and is reported', () => {
  const a = backup('2026-09-20T00:00:00Z', { [KEYS.students]: JSON.stringify([{ id: 'S1', name: 'পুরোনো', updatedAt: '2026-09-20T00:00:00Z' }]) });
  const b = backup('2026-09-29T00:00:00Z', { [KEYS.students]: JSON.stringify([{ id: 'S1', name: 'নতুন', updatedAt: '2026-09-25T00:00:00Z' }]) });
  const { merged, report } = mergeBackups(a, b);
  assert.equal(JSON.parse(merged.data[KEYS.students])[0].name, 'নতুন');
  assert.equal(report.conflicts.length, 1);
});

test('routine and teaching documents merge by id instead of replacing a day', () => {
  const a = backup('2026-09-20T00:00:00Z', {
    [KEYS.routine]: JSON.stringify({ sat: { date: 'x', classes: [{ id: 'R1', subject: 'Math' }] } }),
    [KEYS.teaching]: JSON.stringify({ version: 1, activities: [{ id: 'T1', title: 'A', updatedAt: '2026-09-19T00:00:00Z' }] })
  });
  const b = backup('2026-09-29T00:00:00Z', {
    [KEYS.routine]: JSON.stringify({ sat: { date: 'x', classes: [{ id: 'R2', subject: 'English' }] }, sun: { date: 'y', classes: [] } }),
    [KEYS.teaching]: JSON.stringify({ version: 1, activities: [{ id: 'T2', title: 'B', updatedAt: '2026-09-28T00:00:00Z' }] })
  });
  const { merged } = mergeBackups(a, b);
  const routine = JSON.parse(merged.data[KEYS.routine]);
  assert.deepEqual(routine.sat.classes.map(item => item.id).sort(), ['R1', 'R2']);
  assert.equal(routine.sun.date, 'y');
  const teaching = JSON.parse(merged.data[KEYS.teaching]);
  assert.deepEqual(teaching.activities.map(item => item.id).sort(), ['T1', 'T2']);
  assert.equal(teaching.version, 1);
});

test('a file that is not an Active Plus backup is rejected', () => {
  assert.throws(() => mergeBackups({ hello: 'world' }, backup('2026-09-29T00:00:00Z', {})), /Active Plus/);
});
