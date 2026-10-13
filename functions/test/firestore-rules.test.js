const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const {
  doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp,
  collection, query, where, getDocs
} = require('firebase/firestore');

const RULES = () => readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');

async function freshEnv(t) {
  const env = await initializeTestEnvironment({
    projectId: 'demo-apc-phase3',
    firestore: { rules: RULES() }
  });
  t.after(() => env.cleanup());
  return env;
}

let env;
test('Firestore role boundary: server-only reviews, Manager academic reports only', async t => {
  env = await freshEnv(t);
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
  await assertFails(updateDoc(doc(managerDb, 'students/student-1'), {
    status: 'approved', reviewedBy: 'manager-1', reviewedAt: serverTimestamp()
  }));
  await assertSucceeds(getDoc(doc(managerDb, 'students/student-1')));
  await assertFails(updateDoc(doc(managerDb, 'users/student-1'), { role: 'admin', status: 'active' }));

  await assertFails(getDoc(doc(managerDb, 'transactions/tx-1')));
  await assertFails(getDoc(doc(managerDb, 'reports/finance-1')));
  await assertSucceeds(getDoc(doc(managerDb, 'academicReports/attendance-1')));
  await assertFails(getDoc(doc(managerDb, 'settings/private')));
  await assertSucceeds(getDoc(doc(adminDb, 'reports/finance-1')));

  await assertFails(updateDoc(doc(adminDb, 'exams/exam-1'), {
    status: 'published', reviewedBy: 'admin-1', reviewedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(doc(managerDb, 'exams/exam-1'), {
    status: 'published', reviewedBy: 'manager-1', reviewedAt: serverTimestamp(), publishedAt: serverTimestamp()
  }));
});

test('staged enrollment: pending identity and username reservation are never browser-writable', async t => {
  const env = await freshEnv(t);
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/stu-new'), { uid: 'stu-new', email: 'new@example.com', role: 'student', status: 'pending' });
    await setDoc(doc(db, 'students/stu-new'), { uid: 'stu-new', status: 'pending', className: 'দশম শ্রেণি' });
    await setDoc(doc(db, 'usernameIndex/student.new'), { uid: 'stu-new', role: 'student' });
    await setDoc(doc(db, 'studentApprovals/stu-new'), { studentId: 'stu-new', decision: 'approved' });
  });
  const db = env.authenticatedContext('stu-new', { role: 'student', status: 'pending' }).firestore();
  const manager = env.authenticatedContext('manager-1', { role: 'manager', status: 'active' }).firestore();
  await assertFails(getDoc(doc(db, 'users/stu-new')));
  await assertFails(getDoc(doc(db, 'students/stu-new')));
  await assertSucceeds(getDoc(doc(manager, 'students/stu-new')));
  await assertFails(getDoc(doc(db, 'usernameIndex/student.new')));
  await assertFails(getDoc(doc(manager, 'usernameIndex/student.new')));
  await assertFails(setDoc(doc(db, 'usernameIndex/student.new'), { uid: 'stu-new' }));
  await assertFails(setDoc(doc(db, 'users/stu-new'), { role: 'student', status: 'approved' }));
  await assertFails(updateDoc(doc(manager, 'students/stu-new'), { status: 'approved' }));
  await assertFails(setDoc(doc(manager, 'studentApprovals/stu-new'), { decision: 'approved' }));
});

test('staged payment: only server can mint receipt, number and reference; Manager cannot read ledger directly', async t => {
  const env = await freshEnv(t);
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'transactions/pay-1'), { createdBy: 'counter-1', studentId: 'stu-1', amount: 100, status: 'pending' });
    await setDoc(doc(db, 'receiptSequences/counter-1'), { uid: 'counter-1', last: 1 });
    await setDoc(doc(db, 'receiptNumbers/FC123-00000001'), { transactionId: 'pay-1' });
    await setDoc(doc(db, 'paymentReferences/abc'), { transactionId: 'pay-1' });
    await setDoc(doc(db, 'paymentReversals/pay-1'), { id: 'pay-1', studentId: 'stu-1', state: 'pending', reason: 'Correction requested' });
  });
  const counter = env.authenticatedContext('counter-1', { role: 'payment', status: 'active' }).firestore();
  const other = env.authenticatedContext('counter-2', { role: 'payment', status: 'active' }).firestore();
  const manager = env.authenticatedContext('manager-1', { role: 'manager', status: 'active' }).firestore();
  const admin = env.authenticatedContext('admin-1', { role: 'admin', status: 'active' }).firestore();
  await assertSucceeds(getDoc(doc(counter, 'transactions/pay-1')));
  await assertSucceeds(getDoc(doc(admin, 'transactions/pay-1')));
  await assertSucceeds(getDocs(query(collection(admin, 'transactions'), where('studentId', '==', 'stu-1'))));
  await assertFails(getDocs(query(collection(counter, 'transactions'), where('studentId', '==', 'stu-1'))));
  await assertFails(getDoc(doc(other, 'transactions/pay-1')));
  await assertFails(getDoc(doc(manager, 'transactions/pay-1')));
  await assertFails(setDoc(doc(counter, 'transactions/pay-forged'), { createdBy: 'counter-1', status: 'approved' }));
  await assertFails(updateDoc(doc(manager, 'transactions/pay-1'), { status: 'approved' }));
  for (const path of ['receiptSequences/counter-1', 'receiptNumbers/FC123-00000001', 'paymentReferences/abc']) {
    await assertFails(getDoc(doc(counter, path)));
    await assertFails(getDoc(doc(admin, path)));
    await assertFails(setDoc(doc(admin, path), { last: 999 }));
  }
  await assertSucceeds(getDoc(doc(admin, 'paymentReversals/pay-1')));
  await assertSucceeds(getDocs(query(collection(admin, 'paymentReversals'), where('studentId', '==', 'stu-1'))));
  await assertFails(getDoc(doc(counter, 'paymentReversals/pay-1')));
  await assertFails(getDoc(doc(manager, 'paymentReversals/pay-1')));
  await assertFails(setDoc(doc(manager, 'paymentReversals/pay-2'), { state: 'approved' }));
  await assertFails(updateDoc(doc(admin, 'paymentReversals/pay-1'), { state: 'approved' }));
});

test('answer key: a student can never read exams/{id}/private/key', async t => {
  const env = await freshEnv(t);
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'students/stu-1'), { uid: 'stu-1', status: 'approved', className: 'Ten', group: 'A' });
    await setDoc(doc(db, 'exams/exam-1'), {
      status: 'published', teacherUid: 'teacher-1', className: 'Ten', resultsReleased: false,
      questions: [{ uid: 'q1', options: ['A', 'B'] }]
    });
    await setDoc(doc(db, 'exams/exam-1/private/key'), { answers: { q1: 'a' } });
    await setDoc(doc(db, 'exams/exam-1/releasedKey/answers'), { answers: { q1: 'a' }, releasedAt: serverTimestamp() });
    await setDoc(doc(db, 'exams/exam-draft'), {
      status: 'draft', teacherUid: 'teacher-1', className: 'Ten', questions: []
    });
    await setDoc(doc(db, 'exams/exam-group-b'), {
      status: 'published', teacherUid: 'teacher-1', className: 'Ten', group: 'B', resultsReleased: true, questions: []
    });
    await setDoc(doc(db, 'exams/exam-group-b/releasedKey/answers'), { answers: { q1: 'b' }, releasedAt: serverTimestamp() });
    await setDoc(doc(db, 'students/stu-other'), { uid: 'stu-other', status: 'approved', className: 'Twelve', group: 'A' });
  });

  const studentDb = env.authenticatedContext('stu-1', { role: 'student', status: 'approved' }).firestore();
  const otherStudentDb = env.authenticatedContext('stu-other', { role: 'student', status: 'approved' }).firestore();
  const teacherDb = env.authenticatedContext('teacher-1', { role: 'teacher', status: 'active', classes: ['Ten'] }).firestore();
  const adminDb = env.authenticatedContext('admin-1', { role: 'admin', status: 'active' }).firestore();

  // The key itself: owner teacher + admin read it; nobody else.
  await assertFails(getDoc(doc(studentDb, 'exams/exam-1/private/key')));
  await assertFails(getDoc(doc(otherStudentDb, 'exams/exam-1/private/key')));
  await assertSucceeds(getDoc(doc(teacherDb, 'exams/exam-1/private/key')));
  await assertSucceeds(getDoc(doc(adminDb, 'exams/exam-1/private/key')));
  // A student cannot smuggle answers into a paper either.
  await assertFails(setDoc(doc(studentDb, 'exams/exam-1/private/key'), { answers: { q1: 'a' } }));

  // Published paper of the student's own class reads; a draft or another
  // class's paper does not. Released answers read only after release.
  await assertSucceeds(getDoc(doc(studentDb, 'exams/exam-1')));
  await assertFails(getDoc(doc(studentDb, 'exams/exam-draft')));
  await assertFails(getDoc(doc(otherStudentDb, 'exams/exam-1')));
  await assertFails(getDoc(doc(studentDb, 'exams/exam-group-b')));
  await assertFails(getDoc(doc(studentDb, 'exams/exam-group-b/releasedKey/answers')));
  await assertFails(getDoc(doc(studentDb, 'exams/exam-1/releasedKey/answers')), 'a partial release is hidden');
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'exams/exam-1'), { resultsReleased: true });
  });
  await assertSucceeds(getDoc(doc(studentDb, 'exams/exam-1/releasedKey/answers')));
});

test('published exams are frozen for teacher/admin; drafts stay editable', async t => {
  const env = await freshEnv(t);
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'exams/exam-pub'), {
      status: 'published', teacherUid: 'teacher-1', className: 'Ten',
      title: 'Published', questions: [{ uid: 'q1', options: ['A', 'B'] }]
    });
    await setDoc(doc(db, 'exams/exam-draft'), {
      status: 'draft', teacherUid: 'teacher-1', className: 'Ten',
      title: 'Draft', questions: [{ uid: 'q1', options: ['A', 'B'] }]
    });
    await setDoc(doc(db, 'exams/exam-keyed'), {
      status: 'draft', teacherUid: 'teacher-1', className: 'Ten',
      title: 'Keyed', questions: [{ uid: 'q1', answer: 'A', options: ['A', 'B'] }]
    });
  });

  const teacherDb = env.authenticatedContext('teacher-1', { role: 'teacher', status: 'active', classes: ['Ten'] }).firestore();
  const adminDb = env.authenticatedContext('admin-1', { role: 'admin', status: 'active' }).firestore();
  const managerDb = env.authenticatedContext('manager-1', { role: 'manager', status: 'active' }).firestore();

  // The published paper is immutable for everyone but the Manager review
  // transition — and Manager can only move a pending paper.
  await assertFails(updateDoc(doc(teacherDb, 'exams/exam-pub'), { title: 'Renamed' }));
  await assertFails(updateDoc(doc(adminDb, 'exams/exam-pub'), { title: 'Renamed' }));
  await assertFails(updateDoc(doc(managerDb, 'exams/exam-pub'), { status: 'rejected' }));
  await assertFails(deleteDoc(doc(teacherDb, 'exams/exam-pub')));

  // Draft writes must go through a validating server workflow, not the browser.
  await assertFails(updateDoc(doc(teacherDb, 'exams/exam-draft'), { title: 'Draft v2' }));
  await assertFails(updateDoc(doc(teacherDb, 'exams/exam-draft'), {
    questions: [{ uid: 'q1', answer: 'A', options: ['A', 'B'] }]
  }));
  await assertFails(updateDoc(doc(teacherDb, 'exams/exam-keyed'), { title: 'Still keyed' }));
});

test('payment counter: only its own ledger rows, append-only', async t => {
  const env = await freshEnv(t);
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'transactions/tx-mine'), {
      amount: 500, studentId: 'stu-1', receiptNo: 'R-1', createdBy: 'payment-1'
    });
    await setDoc(doc(db, 'transactions/tx-theirs'), {
      amount: 700, studentId: 'stu-2', receiptNo: 'R-2', createdBy: 'payment-2'
    });
    await setDoc(doc(db, 'studentSummaries/stu-1'), {
      name: 'Student One', studentId: 'stu-1', className: 'Ten', mobile: '01711111111',
      monthlyFee: 1500, status: 'approved'
    });
    await setDoc(doc(db, 'studentSummaries/stu-pending'), {
      name: 'Pending', studentId: 'stu-pending', className: 'Ten', mobile: '01722222222',
      monthlyFee: 1500, status: 'pending'
    });
  });

  const paymentDb = env.authenticatedContext('payment-1', { role: 'payment', status: 'active' }).firestore();
  const adminDb = env.authenticatedContext('admin-1', { role: 'admin', status: 'active' }).firestore();

  await assertSucceeds(getDoc(doc(paymentDb, 'transactions/tx-mine')));
  await assertFails(getDoc(doc(paymentDb, 'transactions/tx-theirs')));
  await assertSucceeds(getDoc(doc(adminDb, 'transactions/tx-theirs')));

  // The ledger is append-only: no edits, no deletes, for anyone.
  await assertFails(updateDoc(doc(paymentDb, 'transactions/tx-mine'), { amount: 1 }));
  await assertFails(deleteDoc(doc(paymentDb, 'transactions/tx-mine')));
  await assertFails(updateDoc(doc(adminDb, 'transactions/tx-theirs'), { amount: 1 }));
  await assertFails(deleteDoc(doc(adminDb, 'transactions/tx-theirs')));

  // Even a plausible receipt is untrusted until a server checks uniqueness.
  await assertFails(setDoc(doc(paymentDb, 'transactions/tx-new'), {
    amount: 100, studentId: 'stu-1', receiptNo: 'R-9', createdBy: 'payment-1'
  }));
  await assertFails(setDoc(doc(paymentDb, 'transactions/tx-bad-amount'), {
    amount: 0, studentId: 'stu-1', receiptNo: 'R-3', createdBy: 'payment-1'
  }));
  await assertFails(setDoc(doc(paymentDb, 'transactions/tx-no-receipt'), {
    amount: 100, studentId: 'stu-1', createdBy: 'payment-1'
  }));
  await assertFails(setDoc(doc(paymentDb, 'transactions/tx-spoof'), {
    amount: 100, studentId: 'stu-1', receiptNo: 'R-4', createdBy: 'payment-2'
  }));

  // Limited student surface: approved rows read, pending rows do not.
  await assertSucceeds(getDoc(doc(paymentDb, 'studentSummaries/stu-1')));
  await assertFails(getDoc(doc(paymentDb, 'studentSummaries/stu-pending')));
  await assertFails(setDoc(doc(paymentDb, 'studentSummaries/stu-1'), { name: 'Edited' }));

  // Own-row listing only: a query that would include someone else's rows fails.
  await assertSucceeds(getDocs(query(collection(paymentDb, 'transactions'), where('createdBy', '==', 'payment-1'))));
  await assertFails(getDocs(query(collection(paymentDb, 'transactions'), where('createdBy', '==', 'payment-2'))));
});

test('per-student append-only records and Manager approval audit trail', async t => {
  const env = await freshEnv(t);
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'students/stu-1'), { uid: 'stu-1', status: 'approved', className: 'Ten', group: 'A' });
    await setDoc(doc(db, 'students/stu-2'), { uid: 'stu-2', status: 'approved', className: 'Twelve', group: 'A' });
    await setDoc(doc(db, 'exams/exam-1'), { status: 'published', resultsReleased: false });
    await setDoc(doc(db, 'attempts/att-1'), { studentId: 'stu-1', examId: 'exam-1', answers: { q1: 'a' } });
    await setDoc(doc(db, 'results/res-1'), { studentId: 'stu-1', examId: 'exam-1', score: 1, total: 1 });
    await setDoc(doc(db, 'studentApprovals/app-1'), { studentId: 'stu-1', state: 'pending' });
    await setDoc(doc(db, 'homeworkSubmissions/hw-1'), { studentId: 'stu-1', text: 'work' });
    await setDoc(doc(db, 'notices/n-1'), { title: 'Notice' });
    await setDoc(doc(db, 'routine/r-1'), { teacherUid: 'teacher-1', day: 'sun' });
  });

  const studentDb = env.authenticatedContext('stu-1', { role: 'student', status: 'approved' }).firestore();
  const otherStudentDb = env.authenticatedContext('stu-2', { role: 'student', status: 'approved' }).firestore();
  const teacherDb = env.authenticatedContext('teacher-1', { role: 'teacher', status: 'active', classes: ['Ten'] }).firestore();
  const otherTeacherDb = env.authenticatedContext('teacher-2', { role: 'teacher', status: 'active', classes: ['Nine'] }).firestore();
  const managerDb = env.authenticatedContext('manager-1', { role: 'manager', status: 'active' }).firestore();

  // Student own-only reads/writes; rows are immutable.
  await assertSucceeds(getDoc(doc(studentDb, 'attempts/att-1')));
  await assertFails(getDoc(doc(otherStudentDb, 'attempts/att-1')));
  await assertFails(updateDoc(doc(studentDb, 'attempts/att-1'), { answers: {} }));
  await assertFails(deleteDoc(doc(studentDb, 'attempts/att-1')));
  await assertFails(setDoc(doc(studentDb, 'attempts/att-2'), { studentId: 'stu-1', examId: 'exam-1', answers: {} }));
  await assertFails(setDoc(doc(studentDb, 'attempts/att-spoof'), { studentId: 'stu-2', examId: 'exam-1', answers: {} }));
  await assertFails(setDoc(doc(studentDb, 'results/res-mine'), { studentId: 'stu-1', score: 99, total: 1 }));
  await assertFails(getDoc(doc(studentDb, 'results/res-1')), 'partial score is hidden');
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'exams/exam-1'), { resultsReleased: true });
  });
  await assertSucceeds(getDoc(doc(studentDb, 'results/res-1')));
  await assertFails(getDoc(doc(otherStudentDb, 'results/res-1')));

  // Teacher class-scoped reads: own class yes, other class no.
  await assertSucceeds(getDoc(doc(teacherDb, 'homeworkSubmissions/hw-1')));
  await assertFails(getDoc(doc(otherTeacherDb, 'homeworkSubmissions/hw-1')));

  // Server owns approval audit rows; other staff work remains local/staged.
  await assertFails(setDoc(doc(managerDb, 'studentApprovals/app-2'), { studentId: 'stu-2', state: 'pending' }));
  await assertFails(updateDoc(doc(managerDb, 'studentApprovals/app-1'), { state: 'reviewed' }));
  await assertFails(deleteDoc(doc(managerDb, 'studentApprovals/app-1')));
  await assertSucceeds(setDoc(doc(managerDb, 'notices/n-2'), { title: 'Manager notice' }));
  await assertFails(setDoc(doc(studentDb, 'notices/n-3'), { title: 'Student notice' }));
  await assertSucceeds(setDoc(doc(teacherDb, 'routine/r-mine'), { teacherUid: 'teacher-1', day: 'mon' }));
  await assertFails(setDoc(doc(teacherDb, 'routine/r-theirs'), { teacherUid: 'teacher-2', day: 'mon' }));
  await assertFails(updateDoc(doc(otherTeacherDb, 'routine/r-1'), { day: 'tue' }));
});
