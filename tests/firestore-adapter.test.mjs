import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KEYS,
  writeRaw,
  readJSON,
  createFirestoreAdapter,
  setDatabaseAdapter,
  localStorageAdapter,
  resolveConflictByUpdatedAt,
  splitExamForFirestore,
  mergeExamFromFirestore
} from '../js/database.js';

function setup() {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: k => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: k => store.delete(k)
    }
  };
  return store;
}

test('resolveConflictByUpdatedAt lets the newer updatedAt win deterministically', () => {
  const older = { id: 'DOC-1', title: 'পুরোনো', updatedAt: '2026-10-10T10:00:00.000Z' };
  const newer = { id: 'DOC-1', title: 'নতুন', updatedAt: '2026-10-13T10:00:00.000Z' };
  assert.equal(resolveConflictByUpdatedAt(older, newer).title, 'নতুন');
  assert.equal(resolveConflictByUpdatedAt(newer, older).title, 'নতুন');
});

test('splitExamForFirestore strips answer keys from main exam document into private/key', () => {
  const exam = {
    id: 'EX-100',
    title: 'পদার্থবিজ্ঞান কুইজ',
    status: 'published',
    className: 'দশম শ্রেণি',
    updatedAt: 1760000000000,
    questions: [
      { uid: 'EX-100-q1', text: 'বল কী?', marks: 1, options: [{ id: 'A', text: 'ভর×ত্বরণ' }], answer: 'A' }
    ]
  };
  const { examDoc, keyDoc } = splitExamForFirestore(exam);
  assert.equal('answer' in examDoc.questions[0], false, 'main exam doc has no answer field');
  assert.equal(keyDoc.examId, 'EX-100');
  assert.equal(keyDoc.answers['EX-100-q1'].answer, 'A');

  const merged = mergeExamFromFirestore(examDoc, keyDoc);
  assert.equal(merged.questions[0].answer, 'A');
});

test('offline-first Firestore adapter writes local immediately, queues idempotently, and flushes with updatedAt conflict resolution', async () => {
  setup();
  const remoteStore = new Map();
  const adapter = createFirestoreAdapter({
    auth: { currentUser: { uid: 'TCH-001', role: 'teacher' } },
    store: {
      getDoc: async path => remoteStore.get(path) || null,
      setDoc: async (path, data) => remoteStore.set(path, data)
    }
  });
  setDatabaseAdapter(adapter);

  try {
    // 1. Write courses locally while offline/queued
    writeRaw(KEYS.courses, JSON.stringify({
      version: 1,
      courses: [
        { id: 'CRS-1', subject: 'গণিত', className: 'দশম শ্রেণি', status: 'published', updatedAt: '2026-10-12T08:00:00.000Z', chapters: [] }
      ]
    }));
    // Local fallback has it immediately
    assert.equal(readJSON(KEYS.courses).courses[0].subject, 'গণিত');
    assert.equal(adapter.pendingCount(), 1);

    // 2. Newer update to the same id coalesces idempotently in outbox
    writeRaw(KEYS.courses, JSON.stringify({
      version: 1,
      courses: [
        { id: 'CRS-1', subject: 'উচ্চতর গণিত', className: 'দশম শ্রেণি', status: 'published', updatedAt: '2026-10-13T09:00:00.000Z', chapters: [] }
      ]
    }));
    assert.equal(adapter.pendingCount(), 1);

    // 3. Write exam -> splits public exam and private key on flush
    writeRaw(KEYS.exams, JSON.stringify({
      version: 1,
      exams: [
        { id: 'EX-200', title: 'গণিত পরীক্ষা', questions: [{ uid: 'EX-200-q1', text: '২+২?', marks: 1, answer: 'B' }], updatedAt: 1760000001000 }
      ],
      attempts: []
    }));

    const res = await adapter.flush();
    assert.equal(res.flushed, 2);
    assert.equal(res.pending, 0);
    assert.equal(remoteStore.get('courses/CRS-1').subject, 'উচ্চতর গণিত');
    assert.equal('answer' in remoteStore.get('exams/EX-200').questions[0], false);
    assert.equal(remoteStore.get('exams/EX-200/private/key').answers['EX-200-q1'].answer, 'B');
  } finally {
    setDatabaseAdapter(localStorageAdapter);
  }
});

test('firestore.rules enforces course and teaching class-section + teacherId rules', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /match \/courses\/\{courseId\}/);
  assert.match(rules, /courseForStudent\(\)/);
  assert.match(rules, /ownsCourse\(resource\.data\)/);
  assert.match(rules, /match \/private\/\{document\}/);
});
