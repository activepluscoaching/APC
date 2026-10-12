const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, serverTimestamp } = require('firebase/firestore');

let env;
test('Firestore role boundary: Manager approvals, academic reports only, Admin never approves', async t => {
  env = await initializeTestEnvironment({
    projectId: 'demo-active-plus-rules',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') }
  });
  t.after(() => env.cleanup());
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/student-1'), { uid: 'student-1', role: 'student', status: 'pending' });
    await setDoc(doc(db, 'students/student-1'), { uid: 'student-1', status: 'pending' });
    await setDoc(doc(db, 'transactions/tx-1'), { amount: 100 });
    await setDoc(doc(db, 'reports/finance-1'), { type: 'finance' });
    await setDoc(doc(db, 'academicReports/attendance-1'), { type: 'attendance' });
    await setDoc(doc(db, 'settings/private'), { value: 'secret' });
    await setDoc(doc(db, 'exams/exam-1'), { status: 'pending', title: 'Exam' });
  });

  const adminDb = env.authenticatedContext('admin-1', { role: 'admin', status: 'active' }).firestore();
  const managerDb = env.authenticatedContext('manager-1', { role: 'manager', status: 'active' }).firestore();
  await assertFails(updateDoc(doc(adminDb, 'students/student-1'), {
    status: 'approved', reviewedBy: 'admin-1', reviewedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(doc(managerDb, 'students/student-1'), {
    status: 'approved', reviewedBy: 'manager-1', reviewedAt: serverTimestamp()
  }));

  await assertFails(getDoc(doc(managerDb, 'transactions/tx-1')));
  await assertFails(getDoc(doc(managerDb, 'reports/finance-1')));
  await assertSucceeds(getDoc(doc(managerDb, 'academicReports/attendance-1')));
  await assertFails(getDoc(doc(managerDb, 'settings/private')));
  await assertSucceeds(getDoc(doc(adminDb, 'reports/finance-1')));

  await assertFails(updateDoc(doc(adminDb, 'exams/exam-1'), {
    status: 'published', reviewedBy: 'admin-1', reviewedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(doc(managerDb, 'exams/exam-1'), {
    status: 'published', reviewedBy: 'manager-1', reviewedAt: serverTimestamp(), publishedAt: serverTimestamp()
  }));
});
