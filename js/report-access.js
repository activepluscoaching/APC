/* Reports access layer — who may run which report, and over which records.

   The Reports UI hides what a role may not see, but hiding is cosmetic: the
   same decision is taken again here, in the module that actually builds the
   report. A Teacher who edits the URL, calls buildReport() from the console or
   passes another teacher's class gets the same answer as the UI — a refusal —
   because the scope is applied to the records themselves, not to the markup.

   Nothing here invents data: it only filters the app's own records. */
import { hasStaffSession, readStaffAccount } from './staff-auth.js';
import { loadAccount, hasSession } from './storage.js';
import { listTeacherAssignments } from './teacher-assignments.js';

export const ROLE_LABEL = Object.freeze({
  admin: 'Admin',
  manager: 'Manager',
  teacher: 'Teacher',
  cash: 'Cash Counter',
  student: 'Student'
});

const STAFF_ROLES = Object.freeze([
  { staffRole: 'admin', role: 'admin' },
  { staffRole: 'manager', role: 'manager' },
  { staffRole: 'teacher', role: 'teacher' },
  { staffRole: 'payment', role: 'cash' }
]);

const deny = (message = 'আপনার এই রিপোর্ট দেখার অনুমতি নেই।') =>
  Object.assign(new Error(message), { code: 'FORBIDDEN' });

/* The label js/payment.js stamps on every transaction it collects — the
   cash-counter desk's own records are the ones carrying it. */
export const CASH_COUNTER_LABEL = 'পেমেন্ট কাউন্টার';

/**
 * Who is signed in on this device, in report terms.
 * Staff sessions win (they are the panel roles); otherwise a signed-in student.
 */
export async function resolveActor() {
  for (const { staffRole, role } of STAFF_ROLES) {
    if (!(await hasStaffSession(staffRole))) continue;
    const account = await readStaffAccount(staffRole);
    if (!account) continue;
    return {
      kind: 'staff',
      role,
      staffRole,
      username: account.username || '',
      name: account.fullName || account.username || ROLE_LABEL[role],
      mobile: account.mobile || '',
      label: ROLE_LABEL[role]
    };
  }
  if (await hasSession()) {
    const account = loadAccount();
    const student = account?.student || {};
    if (student.id) {
      return {
        kind: 'student',
        role: 'student',
        studentId: String(student.id),
        username: account.username || '',
        name: student.name || account.username || 'শিক্ষার্থী',
        className: student.className || '',
        group: student.group || '',
        label: 'Student'
      };
    }
  }
  return null;
}

/**
 * The records this actor is allowed to read:
 *   • Teacher  — only the classes/batches/subjects the Manager assigned
 *   • Student  — only their own records
 *   • Cash     — the counter's own collections (own history is separate)
 *   • Admin / Manager — the whole institute
 */
export function actorScope(actor) {
  if (!actor) return null;
  if (actor.role === 'teacher') {
    const assignments = listTeacherAssignments(actor.username);
    const pairs = assignments.map(item => ({ className: item.className, group: item.group || '', subject: item.subject }));
    return {
      role: 'teacher',
      classes: [...new Set(pairs.map(pair => pair.className))],
      subjects: [...new Set(pairs.map(pair => pair.subject))].filter(Boolean),
      pairs,
      teacherName: actor.name
    };
  }
  if (actor.role === 'student') {
    return { role: 'student', studentId: actor.studentId, className: actor.className, group: actor.group };
  }
  if (actor.role === 'cash') {
    return { role: 'cash', username: actor.username, counter: 'পেমেন্ট কাউন্টার' };
  }
  return { role: actor.role, classes: null, subjects: null };
}

/** True when the role may even see the report in the catalog. */
export function canAccess(definition, actor) {
  if (!definition || !actor) return false;
  return (definition.roles || []).includes(actor.role);
}

/**
 * The single gate every report goes through before any record is read.
 * Returns the (possibly narrowed) filters, or throws { code: 'FORBIDDEN' }.
 *
 *   • a Student can only ever ask for their own id — a different id is refused
 *   • a Teacher can only ask for classes/batches inside their assignment
 *   • a Cash Counter report stays inside the counter's own collections when the
 *     report is scoped that way ("Own Transaction History")
 */
export function enforceAccess(definition, actor, filters = {}) {
  if (!actor) throw deny('রিপোর্ট দেখতে হলে লগইন করতে হবে।');
  if (!canAccess(definition, actor)) throw deny();
  const scope = actorScope(actor);
  const safe = { ...filters };

  if (actor.role === 'student') {
    // Every student report is "My …": the id can never be redirected.
    const requested = safe.studentId ? String(safe.studentId) : '';
    if (requested && requested !== scope.studentId) throw deny('অন্য শিক্ষার্থীর তথ্য দেখার অনুমতি নেই।');
    safe.studentId = scope.studentId;
    safe.className = scope.className || '';
    safe.batch = scope.group || '';
  }

  if (actor.role === 'teacher' && scope) {
    if (safe.className && safe.className !== 'all' && !scope.classes.includes(safe.className)) {
      throw deny('এই শ্রেণি আপনার assignment-এর মধ্যে নেই।');
    }
    if (safe.batch && safe.batch !== 'all' && scope.pairs.length &&
        !scope.pairs.some(pair => (!safe.className || safe.className === 'all' || pair.className === safe.className) && (!pair.group || pair.group === safe.batch))) {
      throw deny('এই ব্যাচ আপনার assignment-এর মধ্যে নেই।');
    }
    if (safe.subject && safe.subject !== 'all' && scope.subjects.length && !scope.subjects.includes(safe.subject)) {
      throw deny('এই বিষয় আপনার assignment-এর মধ্যে নেই।');
    }
    if (safe.teacher && safe.teacher !== 'all' && safe.teacher !== actor.name && safe.teacher !== actor.username) {
      throw deny('অন্য শিক্ষকের তথ্য দেখার অনুমতি নেই।');
    }
  }

  if (actor.role === 'cash' && definition.id === 'cash.own-history') {
    // Pinned to this desk's collections: no filter can widen it.
    safe.counter = CASH_COUNTER_LABEL;
  }

  if (actor.role === 'manager' && (definition.staffOnly === true)) {
    throw deny('স্টাফ রিপোর্ট শুধু Admin দেখতে পারবেন।');
  }

  return { filters: safe, scope };
}

/* ---------- scoped record sets ---------- */

const sameGroup = (a, b) => String(a || '').normalize('NFC').trim().replace(/\s*বিভাগ$/, '').trim()
  === String(b || '').normalize('NFC').trim().replace(/\s*বিভাগ$/, '').trim();

/** Students a Teacher may report on: their assigned class/batch pairs only. */
export function scopeStudents(students, actor, scope) {
  if (!scope || scope.role !== 'teacher') return students;
  if (!scope.pairs.length) return [];
  return students.filter(student => scope.pairs.some(pair =>
    pair.className === student.className && (!pair.group || sameGroup(pair.group, student.group))
  ));
}

/** Teaching activities (attendance sessions, homework, academic notices). */
export function scopeActivities(activities, actor, scope) {
  if (!scope || scope.role !== 'teacher') return activities;
  if (!scope.pairs.length) return [];
  return activities.filter(activity => scope.pairs.some(pair =>
    (!activity.className || pair.className === activity.className)
    && (!pair.group || !activity.group || sameGroup(pair.group, activity.group))
    && (!pair.subject || !activity.subject || pair.subject === activity.subject)
  ));
}

/** Exams inside the teacher's academic scope; everyone else sees them all. */
export function scopeExams(exams, actor, scope) {
  if (!scope || scope.role !== 'teacher') return exams;
  if (!scope.pairs.length) return [];
  return exams.filter(exam => scope.pairs.some(pair =>
    // An exam is inside the assignment when every dimension it declares
    // matches: an exam that names no class is open to the subject's teacher.
    (!exam.className || pair.className === exam.className)
    && (!pair.group || !exam.group || sameGroup(pair.group, exam.group))
    && (!exam.subject || pair.subject === exam.subject)
  ));
}

/** One student's own records — the only records a Student may ever read. */
export function ownStudent(students, studentId) {
  return students.filter(student => String(student.id) === String(studentId));
}

export { deny };
