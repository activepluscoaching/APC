/* Static contract tests for firestore.rules + functions/index.js.
   The emulator suite (functions/test/firestore-rules.test.js) exercises the
   rules live; these pin every structural guarantee of the security review in
   the root `npm test` run, which has no emulator:

     1. exam answer keys split off the exam doc, student-inaccessible;
        scoring + release live in a Cloud Function after the exam ends;
     2. published exams frozen for teacher/admin edits (Manager review is
        the only publishing path);
     3. teaching: students read published + own class/section only; teacher
        writes require teacherUid == request.auth.uid (Admin excepted);
     4. students: teacher reads approved + own classes only; payment reads the
        limited summary surface of approved students; Manager reads
        pending+approved; Admin edits limited fields (never status/uid);
     5. transactions: amount>0, studentId+receiptNo required, createdBy ==
        request.auth.uid, allowed-field mask; payment reads own rows only;
        update/delete closed for everyone (reversal rows correct mistakes);
     6. notices written by Manager+Admin; routine written by Manager+Admin+
        owning Teacher;
     7. studentApprovals: Manager cannot delete;
     8. attempts/results/attendance/homeworkSubmissions: student own-only,
        teacher class-scoped reads, writes immutable;
     9. staff deactivate / role change revokes refresh tokens. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rules = readFileSync(resolve(root, 'firestore.rules'), 'utf8');
const functionsSrc = readFileSync(resolve(root, 'functions/index.js'), 'utf8');

/** Text of one `match /<name>` block up to the next top-level match. An
 * optional startMarker widens the window backwards to include helper
 * functions or section comments that sit just above the match. */
function matchBlock(name, startMarker = null) {
  const marker = `match /${name}`;
  const at = rules.indexOf(marker);
  assert.ok(at >= 0, `firestore.rules: missing ${marker}`);
  const next = rules.indexOf('\n    match /', at + marker.length);
  const end = next === -1 ? rules.length : next;
  let start = at;
  if (startMarker) {
    const from = rules.indexOf(startMarker);
    assert.ok(from >= 0 && from < at, `firestore.rules: missing ${startMarker}`);
    start = from;
  }
  return rules.slice(start, end);
}

function functionBody(exportName) {
  const start = functionsSrc.indexOf(`exports.${exportName} = `);
  assert.ok(start >= 0, `functions/index.js: missing exports.${exportName}`);
  const next = functionsSrc.indexOf('\nexports.', start + 1);
  return next === -1 ? functionsSrc.slice(start) : functionsSrc.slice(start, next);
}

test('exam answer key is split into exams/{id}/private/key and releasedKey', () => {
  const exams = matchBlock('exams/{examId}', 'function ownsExam');
  const privateBlock = exams.slice(
    exams.indexOf('match /private/{document}'),
    exams.indexOf('match /releasedKey')
  );
  assert.ok(privateBlock.includes('match /private/{document}'), 'private key subcollection missing');
  assert.ok(!privateBlock.includes('isStudent'), 'students must never reach exams/{id}/private/*');
  assert.ok(exams.includes('match /releasedKey'), 'releasedKey (post-exam answers) missing');
  // The main exam document carries stems/options/marks only — never answers.
  assert.ok(exams.includes('carriesNoAnswers(request.resource.data)'));
  for (const branch of ['allow create', 'allow update']) {
    const at = exams.indexOf(branch);
    assert.ok(at >= 0, `exams block: missing ${branch}`);
    assert.ok(exams.slice(at, at + 500).includes('carriesNoAnswers'), `${branch} must reject answer material`);
  }
  assert.match(rules, /!\('answerKey' in data\)/);
  assert.match(rules, /questions\.all\(q, !\('answer' in q\)/);
});

test('scoring and answer release live in Cloud Functions after the exam ends', () => {
  const release = functionBody('releaseExamResults');
  assert.ok(release.includes("collection('private').doc('key')"), 'reads the private key');
  assert.match(release, /Date\.now\(\) < endAt/, 'must refuse before the exam window ends');
  assert.ok(release.includes('scoreAttempt'), 'scores attempts server-side');
  assert.ok(release.includes("collection('results')"), 'writes results server-side');
  assert.ok(release.includes("collection('releasedKey')"), 'publishes answers after the exam');
  assert.ok(functionsSrc.includes("require('./exam-scoring.js')"));
});

test('a published exam is frozen for teacher/admin; Manager review keeps working', () => {
  const exams = matchBlock('exams/{examId}', 'function ownsExam');
  assert.match(exams, /resource\.data\.status in \['draft', 'pending', 'rejected'\]/,
    'teacher/admin may edit only while the review line is open');
  assert.match(exams, /request\.resource\.data\.status in \['draft', 'pending'\]/,
    'teacher/admin cannot set the published state themselves');
  assert.match(exams, /resource\.data\.status == 'pending'\s*\n\s*&& request\.resource\.data\.status in \['published', 'rejected'\]/,
    'managerReviewExam transition pending → published/rejected must survive');
});

test('students read only published exams of their own class', () => {
  const exams = matchBlock('exams/{examId}', 'function ownsExam');
  assert.match(exams, /isStudent\(\) && resource\.data\.status == 'published' && resource\.data\.className == studentClass\(\)/);
});

test('teaching: student read is published + own class/section; teacher writes own rows only', () => {
  const teaching = matchBlock('teaching/{teachingId}', 'function teachingForStudent');
  assert.match(teaching, /teachingForStudent/);
  assert.match(teaching, /resource\.data\.status == 'published'/);
  assert.match(teaching, /resource\.data\.className == studentClass\(\)/);
  assert.match(teaching, /resource\.data\.group == studentGroup\(\)/);
  assert.match(teaching, /isTeacher\(\) && request\.resource\.data\.teacherUid == request\.auth\.uid/);
  assert.match(teaching, /isTeacher\(\) && resource\.data\.teacherUid == request\.auth\.uid/);
  // Admin is the documented exception to teacher ownership.
  assert.match(teaching, /allow create: if isStaffManager\(\) \|\| isStaffAdmin\(\)/);
});

test('students: teacher reads approved of own classes only', () => {
  const students = matchBlock('students/{studentId}');
  assert.match(students, /isTeacher\(\) && resource\.data\.status == 'approved' && resource\.data\.className in assignedClasses\(\)/);
  assert.ok(!students.includes('isPayment'), 'the payment counter never reads the full student record');
});

test('students: Manager reads pending+approved and may only run the review transition', () => {
  const students = matchBlock('students/{studentId}');
  assert.match(students, /isStaffManager\(\) && resource\.data\.status in \['pending', 'approved'\]/);
  assert.match(students, /isStaffManager\(\) && resource\.data\.status == 'pending'/);
  assert.match(students, /request\.resource\.data\.status in \['approved', 'rejected'\]/);
  assert.match(students, /affectedKeys\(\)\.hasOnly\(\['status', 'reviewedBy', 'reviewedAt', 'reviewNote'\]\)/);
});

test('students: Admin edits limited fields only — never status/uid', () => {
  const students = matchBlock('students/{studentId}');
  assert.match(students, /isStaffAdmin\(\)\s*\n\s*&& request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['name', 'fullName', 'mobile', 'classId', 'className', 'group', 'monthlyFee'\]\)/);
  assert.match(students, /allow create: if false/);
});

test('payment counter reads only the limited summary surface of approved students', () => {
  const summaries = matchBlock('studentSummaries/{studentId}', 'Limited student surface');
  assert.match(summaries, /isPayment\(\) && resource\.data\.status == 'approved'/);
  for (const field of ['name', 'Student ID', 'class', 'mobile', 'monthly fee']) {
    assert.ok(summaries.toLowerCase().includes(field.toLowerCase()), `summary surface documents ${field}`);
  }
  assert.match(summaries, /allow create, update: if isStaffAdmin\(\)/);
});

test('transactions: create validates amount, studentId, receiptNo, createdBy and field mask', () => {
  const transactions = matchBlock('transactions/{transactionId}', 'function validTransaction');
  assert.match(transactions, /amount is number/);
  assert.match(transactions, /amount > 0/);
  assert.match(transactions, /studentId is string && request\.resource\.data\.studentId != ''/);
  assert.match(transactions, /receiptNo is string && request\.resource\.data\.receiptNo != ''/);
  assert.match(transactions, /createdBy == request\.auth\.uid/);
  assert.match(transactions, /keys\(\)\.hasOnly\(/);
  assert.match(transactions, /'kind', 'reverses', 'reversedBy'/, 'reversal rows are the correction path');
});

test('transactions: payment reads own rows only, admin reads all, update/delete closed', () => {
  const transactions = matchBlock('transactions/{transactionId}');
  assert.match(transactions, /isAdmin\(\) \|\| \(isPayment\(\) && resource\.data\.createdBy == request\.auth\.uid\)/);
  assert.match(transactions, /allow update: if false/);
  assert.match(transactions, /allow delete: if false/);
});

test('notices: written by Manager+Admin only', () => {
  const notices = matchBlock('notices/{noticeId}');
  assert.match(notices, /allow create, update, delete: if isStaffManager\(\) \|\| isStaffAdmin\(\)/);
});

test('routine: Manager+Admin write any row, Teacher writes only own teacherUid rows', () => {
  const routine = matchBlock('routine/{routineId}');
  assert.match(routine, /allow create: if isStaffManager\(\) \|\| isStaffAdmin\(\)\s*\n\s*\|\| \(isTeacher\(\) && request\.resource\.data\.teacherUid == request\.auth\.uid\)/);
  assert.match(routine, /isTeacher\(\) && resource\.data\.teacherUid == request\.auth\.uid\s*\n\s*&& request\.resource\.data\.teacherUid == request\.auth\.uid/);
});

test('studentApprovals: Manager create/update stay, Manager delete is gone', () => {
  const approvals = matchBlock('studentApprovals/{approvalId}');
  assert.match(approvals, /allow read, create, update: if isStaffAdmin\(\) \|\| isStaffManager\(\)/);
  assert.match(approvals, /allow delete: if isStaffAdmin\(\)/);
  assert.ok(!approvals.includes('allow delete: if isStaffAdmin() || isStaffManager()'),
    'Manager must no longer delete approval records');
});

test('attempts/results/attendance/homeworkSubmissions: own-only writes, immutable', () => {
  for (const name of ['attempts/{attemptId}', 'results/{resultId}', 'attendance/{attendanceId}', 'homeworkSubmissions/{submissionId}']) {
    const block = matchBlock(name);
    assert.match(block, /ownRow\(resource\.data\)/, `${name}: student reads own rows`);
    assert.match(block, /staffRowRead\(resource\.data\)/, `${name}: teacher reads own class`);
    assert.match(block, /allow update: if false/, `${name}: immutable`);
    assert.match(block, /allow delete: if false/, `${name}: immutable`);
  }
  assert.match(matchBlock('attempts/{attemptId}'), /allow create: if isStudent\(\) && ownRow\(request\.resource\.data\)/);
  assert.match(matchBlock('homeworkSubmissions/{submissionId}'), /allow create: if isStudent\(\) && ownRow\(request\.resource\.data\)/);
  assert.match(matchBlock('attendance/{attendanceId}'), /allow create: if isStudent\(\) && ownRow\(request\.resource\.data\)/);
  // Scores are minted server-side: a student can never write their own result.
  assert.match(matchBlock('results/{resultId}'), /allow create: if isStaffAdmin\(\) \|\| \(isTeacher\(\) && classRow\(request\.resource\.data\)\)/);
});

test('staff deactivate and role change revoke refresh tokens', () => {
  const statusBody = functionBody('adminSetAccountStatus');
  assert.match(statusBody, /auth\.revokeRefreshTokens\(uid\)/);
  const provisionBody = functionBody('adminProvisionV2Identities');
  assert.match(provisionBody, /auth\.revokeRefreshTokens\(uid\)/);
});

test('teacher class scoping rides on the classes claim, deny-by-default', () => {
  assert.match(rules, /request\.auth\.token\.classes is list \? request\.auth\.token\.classes : \[\]/);
  assert.match(rules, /className in assignedClasses\(\)/);
});
