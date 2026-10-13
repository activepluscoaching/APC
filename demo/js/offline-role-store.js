import { populateRoleDemo } from './offline-role-demo.js';
/* Offline v2 workspace. All roles use one document and one authorization boundary.
 * Deliberately separate from legacy v1 keys: no silent migration or data loss.
 * Browser storage is NOT a security boundary against the device owner.
 * Replace storage/identity adapters with server transactions/claims when online.
 */
export const ROLE_DB_KEY = 'activePlus.roleWorkspace.v2';
export const ROLE_NAMES = Object.freeze({ admin: 'Admin', manager: 'Manager', teacher: 'Teacher', payment: 'Cash Counter', student: 'Student' });
export const GRANTS = Object.freeze({
  admin: ['staff', 'settings', 'backup', 'reports.all'],
  manager: ['students', 'payments.review', 'notices', 'routines', 'classes', 'academicSettings', 'exams.review', 'results.review', 'reports.operational'],
  teacher: ['roster', 'attendance', 'assignments', 'submissions.review', 'exams.prepare', 'results.prepare', 'feedback', 'notices.academic'],
  payment: ['payments.create', 'payments.own', 'roster.payment'],
  student: ['self', 'submissions.create']
});
const TABLES = ['accounts', 'students', 'payments', 'notices', 'routines', 'classes', 'assignments', 'submissions', 'exams', 'results', 'attendance', 'feedback', 'audit'];
const clone = value => structuredClone(value);
const fail = (code, message = code) => { throw Object.assign(new Error(message), { code }); };
const id = () => globalThis.crypto.randomUUID();
const text = (value, limit = 500) => String(value ?? '').trim().slice(0, limit);
const safeAccount = ({ password, ...account }) => account;
const has = (actor, grant) => GRANTS[actor.role]?.includes(grant);
const assigned = (actor, classId) => Boolean(classId && actor.classIds?.includes(classId));
function need(actor, grant) { if (!has(actor, grant)) fail('ACCESS_DENIED'); }
async function hash(value, salt = id()) {
  if (String(value).length < 8) fail('INVALID_PASSWORD', 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(value), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return { salt, digest: Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('') };
}
function validate(db) {
  if (!db || db.version !== 2 || TABLES.some(t => !Array.isArray(db[t])) || !db.settings || !db.academicSettings) fail('CORRUPT_DATABASE');
  if (TABLES.some(t => new Set(db[t].map(r => r.id)).size !== db[t].length)) fail('CORRUPT_DATABASE');
  if (db.accounts.some(a => !ROLE_NAMES[a.role] || !a.password?.salt || !a.password?.digest)) fail('CORRUPT_DATABASE');
  return db;
}
export function createRoleStore(storage, key = ROLE_DB_KEY) {
  let session = null;
  let queue = Promise.resolve();
  const read = () => {
    const raw = storage.getItem(key);
    if (!raw) fail('NOT_INITIALIZED');
    try { return validate(JSON.parse(raw)); } catch (e) { if (e.code) throw e; fail('CORRUPT_DATABASE'); }
  };
  const actorOf = db => {
    const actor = db.accounts.find(a => a.id === session?.id);
    if (!actor || !actor.active || actor.authVersion !== session.version) { session = null; fail('LOGIN_REQUIRED'); }
    if (actor.role === 'student' && !db.students.some(s => s.id === actor.studentId && s.status === 'approved')) fail('STUDENT_NOT_APPROVED');
    return actor;
  };
  const mutate = work => {
    const execute = async () => {
      const db = read();
      const actor = actorOf(db);
      const result = await work(db, actor);
      validate(db);
      storage.setItem(key, JSON.stringify(db)); // failure leaves persisted data unchanged
      return clone(result);
    };
    const locked = () => globalThis.navigator?.locks ? navigator.locks.request(key, execute) : execute();
    const pending = queue.then(locked, locked);
    queue = pending.catch(() => {});
    return pending;
  };
  const log = (db, actor, action, target) => db.audit.push({ id: id(), actorId: actor.id, role: actor.role, action, target, at: new Date().toISOString() });
  function scope(db, actor, table) {
    const role = actor.role;
    if (table === 'accounts') return role === 'admin' ? db.accounts.filter(a => a.role !== 'student').map(safeAccount) : [safeAccount(actor)];
    if (table === 'audit') { need(actor, 'reports.all'); return db.audit; }
    if (table === 'payments') {
      if (role === 'admin' || role === 'manager') return db.payments;
      return db.payments.filter(p => role === 'payment' ? p.counterId === actor.id : role === 'student' && p.studentId === actor.studentId);
    }
    if (table === 'students') {
      if (role === 'admin' || role === 'manager') return db.students;
      if (role === 'student') return db.students.filter(s => s.id === actor.studentId);
      if (role === 'teacher') return db.students.filter(s => s.status === 'approved' && assigned(actor, s.classId)).map(({ id, name, classId }) => ({ id, name, classId }));
      if (role === 'payment') return db.students.filter(s => s.status === 'approved').map(({ id, name, classId, monthlyFee }) => ({ id, name, classId, monthlyFee }));
    }
    if (role === 'admin' || role === 'manager') return db[table];
    if (role === 'payment') return [];
    const own = db.students.find(s => s.id === actor.studentId);
    if (table === 'classes') return db.classes.filter(c => role === 'teacher' ? assigned(actor, c.id) : own?.classId === c.id);
    if (role === 'teacher') return db[table].filter(r => assigned(actor, r.classId));
    if (['attendance', 'feedback', 'results', 'submissions'].includes(table)) return db[table].filter(r => r.studentId === actor.studentId && (table !== 'results' || r.status === 'published'));
    return db[table].filter(r => (r.classId === own?.classId || r.classId === 'all') && r.status === 'published');
  }
  return {
    exists: () => storage.getItem(key) !== null,
    async seedDemo({ populated = false } = {}) {
      if (storage.getItem(key) !== null) fail('DATABASE_EXISTS', 'বিদ্যমান তথ্য বদলানো হয়নি');
      const db = { version: 2, ...Object.fromEntries(TABLES.map(t => [t, []])), settings: {}, academicSettings: {} };
      const password = await hash('Demo12345');
      db.accounts = Object.keys(ROLE_NAMES).map(role => ({ id: role, username: `${role}.demo`, name: ROLE_NAMES[role], role, active: true, authVersion: 1, classIds: role === 'teacher' ? ['class-8'] : [], ...(role === 'student' ? { studentId: 'student-1' } : {}), password }));
      db.students = [
        { id: 'student-1', name: 'আরিফ হাসান', classId: 'class-8', status: 'approved', monthlyFee: 1500 },
        { id: 'student-2', name: 'মেহরিন আক্তার', classId: 'class-9', status: 'pending', monthlyFee: 1800 }
      ];
      db.classes = [{ id: 'class-8', title: 'অষ্টম শ্রেণি', status: 'published' }, { id: 'class-9', title: 'নবম শ্রেণি', status: 'published' }];
      db.routines = [{ id: 'routine-1', title: 'রবিবার সকাল ৯টা — গণিত', classId: 'class-8', status: 'published' }];
      db.notices = [{ id: 'notice-1', title: 'সাপ্তাহিক মূল্যায়নের প্রস্তুতি নাও', classId: 'class-8', status: 'published', authorId: 'teacher' }];
      db.payments = [{ id: 'payment-1', studentId: 'student-1', counterId: 'payment', amount: 500, status: 'pending', createdAt: new Date().toISOString() }];
      db.exams = [{ id: 'exam-1', title: 'গণিত মূল্যায়ন', classId: 'class-8', authorId: 'teacher', status: 'pending' }];
      db.results = [{ id: 'result-1', title: 'গণিত মূল্যায়ন', studentId: 'student-1', classId: 'class-8', authorId: 'teacher', marks: 80, status: 'pending' }];
      if (populated) populateRoleDemo(db);
      // Do not overwrite another tab that initialized while PBKDF2 was running.
      if (storage.getItem(key) !== null) fail('DATABASE_EXISTS');
      storage.setItem(key, JSON.stringify(db));
    },
    async populateDemo() {
      return mutate((db, actor) => {
        need(actor, 'staff');
        if (!['admin', 'manager', 'teacher', 'payment', 'student'].every(role => db.accounts.some(a => a.id === role && a.username === `${role}.demo`))) fail('DEMO_DATABASE_REQUIRED');
        const counts = populateRoleDemo(db);
        log(db, actor, 'demo.populate', 'workspace');
        return counts;
      });
    },
    registrationClasses() { return read().classes.filter(c => c.status === 'published').map(c => ({ id: c.id, title: c.title })); },
    async registerStudent(fields) {
      const password = await hash(fields.password);
      const execute = () => {
        const db = read();
        const username = text(fields.username).toLowerCase();
        if (!/^[a-z][a-z0-9._]{3,39}$/.test(username) || db.accounts.some(a => a.username === username)) fail('INVALID_USERNAME');
        if (!text(fields.name) || !db.classes.some(c => c.id === fields.classId)) fail('INVALID_PROFILE');
        const studentId = id();
        const accountId = id();
        db.students.push({ id: studentId, name: text(fields.name, 100), classId: fields.classId, monthlyFee: 1500, status: 'pending' });
        db.accounts.push({ id: accountId, studentId, username, name: text(fields.name, 100), role: 'student', active: true, authVersion: 1, classIds: [], password });
        db.audit.push({ id: id(), actorId: accountId, role: 'student', action: 'student.register', target: studentId, at: new Date().toISOString() });
        storage.setItem(key, JSON.stringify(validate(db)));
        return { studentId, status: 'pending' };
      };
      const locked = () => globalThis.navigator?.locks ? navigator.locks.request(key, execute) : execute();
      const pending = queue.then(locked, locked); queue = pending.catch(() => {}); return pending;
    },
    async login(username, password) {
      session = null;
      const db = read();
      const account = db.accounts.find(a => a.username === text(username).toLowerCase() && a.active);
      if (!account || (await hash(password, account.password.salt)).digest !== account.password.digest) fail('INVALID_LOGIN');
      if (account.role === 'student' && !db.students.some(s => s.id === account.studentId && s.status === 'approved')) fail('STUDENT_NOT_APPROVED');
      session = { id: account.id, version: account.authVersion };
      return safeAccount(account);
    },
    logout() { session = null; },
    current() { return safeAccount(actorOf(read())); },
    list(table) {
      if (!TABLES.includes(table)) fail('ACCESS_DENIED');
      const db = read(), actor = actorOf(db);
      return clone(scope(db, actor, table));
    },
    async saveStaff(fields) {
      return mutate(async (db, actor) => {
        need(actor, 'staff');
        const previous = fields.id && db.accounts.find(a => a.id === fields.id);
        if (fields.id && !previous) fail('NOT_FOUND');
        const role = fields.role || previous?.role;
        if (!['manager', 'teacher', 'payment'].includes(role) || previous?.role === 'student' || previous?.role === 'admin') fail('ACCESS_DENIED');
        const username = text(fields.username || previous?.username).toLowerCase();
        if (!/^[a-z][a-z0-9._]{3,39}$/.test(username) || db.accounts.some(a => a.username === username && a.id !== previous?.id)) fail('INVALID_USERNAME');
        const classIds = fields.classIds ?? previous?.classIds ?? [];
        if (!Array.isArray(classIds) || classIds.some(c => !db.classes.some(r => r.id === c))) fail('INVALID_CLASS');
        const account = { id: previous?.id || id(), username, role, name: text(fields.name || previous?.name, 100), active: fields.active ?? previous?.active ?? true, classIds, authVersion: (previous?.authVersion || 0) + 1,
          password: fields.password ? await hash(fields.password) : previous?.password };
        if (!account.name || !account.password || typeof account.active !== 'boolean') fail('INVALID_PROFILE');
        if (previous) Object.assign(previous, account); else db.accounts.push(account);
        log(db, actor, 'staff.save', account.id);
        return safeAccount(account);
      });
    },
    async updateStudent(studentId, fields) {
      return mutate(async (db, actor) => {
        need(actor, 'students');
        const student = db.students.find(s => s.id === studentId);
        if (!student) fail('NOT_FOUND');
        if (fields.status && !['approved', 'rejected'].includes(fields.status)) fail('INVALID_STATUS');
        if (fields.status && student.status !== 'pending') fail('ALREADY_REVIEWED');
        if (fields.classId && !db.classes.some(c => c.id === fields.classId)) fail('INVALID_CLASS');
        for (const key of ['name', 'classId', 'status']) if (fields[key] !== undefined) student[key] = text(fields[key], 100);
        if (fields.password) {
          const account = db.accounts.find(a => a.studentId === studentId);
          if (!account) fail('ACCOUNT_NOT_FOUND');
          account.password = await hash(fields.password); account.authVersion++;
        }
        if (fields.status) { student.reviewedBy = actor.id; student.reviewedAt = new Date().toISOString(); }
        log(db, actor, 'student.update', studentId);
        return student;
      });
    },
    async createPayment({ studentId, amount }) {
      return mutate((db, actor) => {
        need(actor, 'payments.create');
        if (!db.students.some(s => s.id === studentId && s.status === 'approved')) fail('INVALID_STUDENT');
        if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) fail('INVALID_AMOUNT');
        const record = { id: id(), studentId, counterId: actor.id, amount, status: 'pending', createdAt: new Date().toISOString() };
        db.payments.push(record); log(db, actor, 'payment.create', record.id); return record;
      });
    },
    async approvePayment(paymentId) {
      return mutate((db, actor) => {
        need(actor, 'payments.review');
        const record = db.payments.find(p => p.id === paymentId);
        if (!record) fail('NOT_FOUND');
        if (record.status !== 'pending') fail('ALREADY_REVIEWED');
        record.status = 'approved'; record.reviewedBy = actor.id; record.reviewedAt = new Date().toISOString();
        log(db, actor, 'payment.approve', paymentId); return record;
      });
    },
    receipt(paymentId) {
      const db = read(), actor = actorOf(db);
      const row = scope(db, actor, 'payments').find(p => p.id === paymentId);
      if (!row) fail('ACCESS_DENIED');
      return clone({ ...row, label: row.status === 'approved' ? 'অনুমোদিত রসিদ' : 'অস্থায়ী রসিদ — Manager অনুমোদন বাকি' });
    },
    report() {
      const db = read(), actor = actorOf(db);
      if (!has(actor, 'reports.all') && !has(actor, 'reports.operational')) fail('ACCESS_DENIED');
      return { type: actor.role === 'admin' ? 'all' : 'operational', approvedTotal: db.payments.filter(p => p.status === 'approved').reduce((n, p) => n + p.amount, 0), pendingTotal: db.payments.filter(p => p.status === 'pending').reduce((n, p) => n + p.amount, 0), studentCount: db.students.length, payments: clone(db.payments), ...(actor.role === 'admin' ? { staff: db.accounts.filter(a => a.role !== 'student').map(safeAccount), audit: clone(db.audit) } : {}) };
    },
    async saveAcademic(table, fields) {
      const grants = { classes: 'classes', routines: 'routines', assignments: 'assignments', attendance: 'attendance', feedback: 'feedback', exams: 'exams.prepare', results: 'results.prepare' };
      if (!grants[table] && table !== 'notices') fail('ACCESS_DENIED');
      return mutate((db, actor) => {
        if (table === 'notices') { if (!has(actor, 'notices') && !has(actor, 'notices.academic')) fail('ACCESS_DENIED'); }
        else need(actor, grants[table]);
        if (actor.role === 'teacher' && !assigned(actor, fields.classId)) fail('ACCESS_DENIED');
        if (table !== 'classes' && !db.classes.some(c => c.id === fields.classId) && !(actor.role === 'manager' && table === 'notices' && fields.classId === 'all')) fail('INVALID_CLASS');
        const previous = fields.id && db[table].find(r => r.id === fields.id);
        if (fields.id && !previous) fail('NOT_FOUND');
        if (previous && actor.role === 'teacher' && (previous.authorId !== actor.id || !assigned(actor, previous.classId))) fail('ACCESS_DENIED');
        if (previous && ['exams', 'results'].includes(table) && previous.status === 'published') fail('ALREADY_PUBLISHED');
        if (['attendance', 'feedback', 'results'].includes(table) && !db.students.some(s => s.id === fields.studentId && s.classId === fields.classId && s.status === 'approved')) fail('INVALID_STUDENT');
        if (table === 'results' && (!Number.isFinite(fields.marks) || fields.marks < 0 || fields.marks > 100)) fail('INVALID_MARKS');
        const record = { id: previous?.id || id(), title: text(fields.title), classId: fields.classId || '', authorId: actor.id, status: ['exams', 'results'].includes(table) ? 'pending' : 'published', updatedAt: new Date().toISOString() };
        if (!record.title) fail('TITLE_REQUIRED');
        if (['attendance', 'feedback', 'results'].includes(table)) record.studentId = fields.studentId;
        if (table === 'results') record.marks = fields.marks;
        if (previous) Object.assign(previous, record); else db[table].push(record);
        log(db, actor, `${table}.save`, record.id); return record;
      });
    },
    async publish(table, recordId) {
      return mutate((db, actor) => {
        if (!['exams', 'results'].includes(table)) fail('ACCESS_DENIED');
        need(actor, `${table}.review`);
        const row = db[table].find(r => r.id === recordId);
        if (!row) fail('NOT_FOUND');
        if (row.status !== 'pending') fail('ALREADY_REVIEWED');
        row.status = 'published'; row.reviewedBy = actor.id; row.publishedAt = new Date().toISOString();
        log(db, actor, `${table}.publish`, recordId); return row;
      });
    },
    async submit(assignmentId, answer) {
      return mutate((db, actor) => {
        need(actor, 'submissions.create');
        const assignment = scope(db, actor, 'assignments').find(a => a.id === assignmentId);
        if (!assignment || !text(answer)) fail('INVALID_SUBMISSION');
        if (db.submissions.some(s => s.assignmentId === assignmentId && s.studentId === actor.studentId)) fail('ALREADY_SUBMITTED');
        const row = { id: id(), assignmentId, studentId: actor.studentId, classId: assignment.classId, answer: text(answer, 5000), status: 'submitted' };
        db.submissions.push(row); log(db, actor, 'submission.create', row.id); return row;
      });
    },
    async grade(submissionId, marks) {
      return mutate((db, actor) => {
        need(actor, 'submissions.review');
        const row = db.submissions.find(s => s.id === submissionId);
        if (!row || !assigned(actor, row.classId)) fail('ACCESS_DENIED');
        if (!Number.isFinite(marks) || marks < 0 || marks > 100) fail('INVALID_MARKS');
        row.marks = marks; row.status = 'graded'; log(db, actor, 'submission.grade', row.id); return row;
      });
    },
    async saveSettings(fields, academic = false) {
      return mutate((db, actor) => {
        need(actor, academic ? 'academicSettings' : 'settings');
        // Explicit disjoint schemas: Manager cannot smuggle system settings.
        const allowed = academic ? ['academicMessage', 'showRoutine', 'showAssignments'] : ['appName', 'maintenance', 'sessionMinutes'];
        if (Object.keys(fields).some(k => !allowed.includes(k))) fail('ACCESS_DENIED');
        Object.assign(db[academic ? 'academicSettings' : 'settings'], fields);
        log(db, actor, academic ? 'academicSettings.save' : 'settings.save', 'settings'); return fields;
      });
    },
    backup() { const db = read(); need(actorOf(db), 'backup'); return JSON.stringify(db); },
    async restore(content) {
      return mutate((db, actor) => {
        need(actor, 'backup');
        const restored = validate(JSON.parse(content));
        const owner = restored.accounts.find(a => a.id === actor.id && a.role === 'admin' && a.active);
        if (!owner) fail('OWNER_REQUIRED');
        Object.assign(db, clone(restored));
        // Invalidate pre-restore sessions, including this one.
        db.accounts.forEach(a => { a.authVersion = Math.max(Number(a.authVersion) || 0, Date.now()); });
        log(db, actor, 'backup.restore', 'database'); return { ok: true };
      });
    }
  };
}
