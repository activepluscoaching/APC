/* Run only through the Firestore emulator. Static npm tests cannot evaluate
 * rules; never deploy this staging policy until these adversarial checks pass. */
const test = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');

const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');

test('Firebase role, profile, exam key and ledger authority cannot be forged by a browser', async t => {
  const env = await initializeTestEnvironment({ projectId: 'demo-apc-phase3', firestore: { rules } });
  t.after(() => env.cleanup());
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/stu-1'), { uid: 'stu-1', email: 'student@example.com', role: 'student', status: 'approved' });
    await setDoc(doc(db, 'students/stu-1'), { uid: 'stu-1', status: 'approved', className: 'Ten' });
    await setDoc(doc(db, 'students/stu-1/private/contact'), { guardianMobile: '01711111111' });
    await setDoc(doc(db, 'exams/paper-1'), { status: 'published', className: 'Ten', teacherUid: 'teacher-1' });
    await setDoc(doc(db, 'exams/paper-1/private/key'), { answers: { q1: 'A' } });
    await setDoc(doc(db, 'questionBank/unsafe'), { answerKey: 'A' });
  });
  const student = env.authenticatedContext('stu-1', { role: 'student', status: 'approved' }).firestore();
  const other = env.authenticatedContext('stu-2', { role: 'student', status: 'approved' }).firestore();
  const admin = env.authenticatedContext('admin-1', { role: 'admin', status: 'active' }).firestore();
  const manager = env.authenticatedContext('manager-1', { role: 'manager', status: 'active' }).firestore();
  const teacher = env.authenticatedContext('teacher-1', { role: 'teacher', status: 'active' }).firestore();
  const temporary = env.authenticatedContext('admin-new', {
    role: 'admin', status: 'active', mustChangePassword: true
  }).firestore();
  const anonymous = env.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(student, 'users/stu-1')));
  await assertFails(getDoc(doc(other, 'users/stu-1')));
  await assertFails(getDoc(doc(anonymous, 'users/stu-1')));
  await assertFails(getDoc(doc(temporary, 'users/stu-1')));
  await assertFails(setDoc(doc(student, 'users/stu-2'), { role: 'admin', status: 'active' }));
  await assertFails(updateDoc(doc(student, 'users/stu-1'), { role: 'admin', status: 'active' }));
  await assertFails(updateDoc(doc(admin, 'users/stu-1'), { role: 'admin', status: 'active' }));
  await assertSucceeds(getDoc(doc(student, 'students/stu-1/private/contact')));
  await assertFails(getDoc(doc(other, 'students/stu-1/private/contact')));
  await assertFails(updateDoc(doc(student, 'students/stu-1/private/contact'), { guardianMobile: '0' }));
  await assertFails(updateDoc(doc(manager, 'students/stu-1'), { status: 'rejected' }));
  await assertFails(deleteDoc(doc(admin, 'students/stu-1')));
  await assertFails(getDoc(doc(teacher, 'students/stu-1')));
  await assertFails(getDoc(doc(student, 'questionBank/unsafe')));
  await assertSucceeds(getDoc(doc(teacher, 'questionBank/unsafe')));
  await assertFails(getDoc(doc(student, 'exams/paper-1/private/key')));
  await assertFails(updateDoc(doc(teacher, 'exams/paper-1/private/key'), { answers: { q1: 'B' } }));
  await assertFails(setDoc(doc(manager, 'exams/forged'), { status: 'published', questions: [{ answer: 'A' }] }));
  await assertFails(setDoc(doc(admin, 'transactions/forged'), {
    studentId: 'stu-1', amount: 999, receiptNo: 'R-1', createdBy: 'admin-1'
  }));
  await assertFails(setDoc(doc(student, 'results/forged'), { studentId: 'stu-1', score: 100 }));
});
