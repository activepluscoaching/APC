'use strict';

/* Phase 8: server-owned fee projection, pending counter receipt, Manager review.
 * No live UI, local ledger writes, reversals or payment gateway settlement.
 * Browser clients cannot write any of these Firestore paths. */
const crypto = require('node:crypto');
const { safeId } = require('./staged-exam-core.cjs');
const FEE_TYPES = Object.freeze(['মাসিক বেতন', 'ভর্তি ফি', 'মডেল টেস্ট ফি', 'লেকচার শিট ফি', 'পরীক্ষার ফি', 'অন্যান্য']);
const METHODS = Object.freeze(['নগদ (Cash)', 'বিকাশ (bKash)', 'নগদ (Nagad)', 'রকেট (Rocket)', 'ব্যাংক ট্রান্সফার']);
const MONTHS = Object.freeze(['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর']);
const MAX_AMOUNT = 10_000_000;
const object = data => data !== null && typeof data === 'object' && !Array.isArray(data);
const exact = (data, fields) => object(data) && Object.keys(data).every(key => fields.includes(key));
const email = address => typeof address === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
class PaymentError extends Error {
  constructor(code) { super(code); this.name = 'PaymentError'; this.code = code; }
}
const refuse = code => { throw new PaymentError(code); };
const amount = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_AMOUNT;
const digest = input => crypto.createHash('sha256').update(input).digest('hex');
function staff(caller, role) {
  const uid = caller?.uid, claims = caller?.token || {};
  if (!safeId(uid) || claims.role !== role || claims.status !== 'active' ||
      claims.mustChangePassword === true || claims.firebase?.sign_in_provider !== 'password' ||
      !email(claims.email)) refuse('role-denied');
  return { uid, email: claims.email.toLowerCase() };
}
function staffProfile(row, identity, role) {
  return row?.uid === identity.uid && row.role === role && row.status === 'active' &&
    row.mustChangePassword !== true && email(row.email) && row.email.toLowerCase() === identity.email;
}
function authorizedStudent(user, student, uid) {
  return user?.uid === uid && user.role === 'student' && user.status === 'approved' &&
    student?.uid === uid && student.status === 'approved' &&
    typeof student.fullName === 'string' && student.fullName.length >= 2 && student.fullName.length <= 100 &&
    typeof student.mobile === 'string' && /^01[3-9]\d{8}$/.test(student.mobile) &&
    typeof student.className === 'string' && student.className.length > 0 && student.className.length <= 80 &&
    typeof student.group === 'string' && student.group.length <= 80;
}
function projection(student, uid, monthlyFee) {
  return { studentId: uid, name: student.fullName, className: student.className,
    group: student.group, mobile: student.mobile, monthlyFee, status: 'approved' };
}
function matchesProjection(row, student, uid) {
  return object(row) && amount(row.monthlyFee) &&
    Object.entries(projection(student, uid, row.monthlyFee)).every(([key, value]) => row[key] === value) &&
    Object.keys(row).every(key => ['studentId', 'name', 'className', 'group', 'mobile', 'monthlyFee', 'status', 'configuredBy', 'configuredAt'].includes(key));
}

async function configureStagedFee({ db, auth, caller, data, serverTimestamp } = {}) {
  if (!db?.doc || !db?.runTransaction || !auth?.getUser || typeof serverTimestamp !== 'function') refuse('trusted-admin-required');
  const identity = staff(caller, 'admin');
  if (!exact(data, ['studentId', 'monthlyFee']) || !safeId(data.studentId) || !amount(data.monthlyFee)) refuse('invalid-fee');
  const uid = data.studentId;
  const authStudent = await auth.getUser(uid);
  if (authStudent.uid !== uid || authStudent.disabled || !authStudent.emailVerified ||
      authStudent.customClaims?.role !== 'student' || authStudent.customClaims.status !== 'approved' ||
      authStudent.customClaims.studentId !== uid) refuse('student-denied');
  return db.runTransaction(async tx => {
    const [adminSnap, userSnap, studentSnap, summarySnap] = await Promise.all([
      tx.get(db.doc(`users/${identity.uid}`)), tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`students/${uid}`)), tx.get(db.doc(`studentSummaries/${uid}`))
    ]);
    const user = userSnap.exists ? userSnap.data() : null;
    const student = studentSnap.exists ? studentSnap.data() : null;
    if (!staffProfile(adminSnap.exists ? adminSnap.data() : null, identity, 'admin') ||
        !authorizedStudent(user, student, uid)) refuse('student-denied');
    if (summarySnap.exists) {
      const previous = summarySnap.data();
      if (matchesProjection(previous, student, uid) && previous.monthlyFee === data.monthlyFee)
        return { ok: true, studentId: uid, alreadyConfigured: true };
      refuse('summary-reserved'); // fee changes require a separate reviewed workflow
    }
    tx.create(db.doc(`studentSummaries/${uid}`), {
      ...projection(student, uid, data.monthlyFee), configuredBy: identity.uid, configuredAt: serverTimestamp()
    });
    return { ok: true, studentId: uid, alreadyConfigured: false };
  });
}

function preparedReceipt(data, now) {
  if (!exact(data, ['requestId', 'studentId', 'amount', 'feeType', 'month', 'method', 'trxRef']) ||
      !safeId(data.studentId) || typeof data.requestId !== 'string' ||
      !/^[A-Za-z0-9_-]{16,64}$/.test(data.requestId) || !amount(data.amount) || data.amount === 0 ||
      !FEE_TYPES.includes(data.feeType) || !METHODS.includes(data.method) ||
      typeof data.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month) ||
      !Number.isSafeInteger(now)) refuse('invalid-payment');
  const [year, month] = data.month.split('-').map(Number);
  const trxRef = data.trxRef === undefined ? '' : data.trxRef;
  if (typeof trxRef !== 'string' ||
      (data.method === 'নগদ (Cash)' ? trxRef !== '' : !/^[A-Za-z0-9._:/-]{1,120}$/.test(trxRef))) refuse('invalid-payment');
  const bengali = n => String(n).replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[digit]);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
  return { ...data, trxRef, month: `${MONTHS[month - 1]} ${bengali(year)}`,
    date: `${bengali(Number(parts.day))} ${MONTHS[Number(parts.month) - 1]} ${bengali(Number(parts.year))}` };
}
const receiptId = (uid, requestId) => `pay_${digest(`${uid}\0${requestId}`)}`;
const receiptPrefix = uid => `FC${digest(uid).slice(0, 12).toUpperCase()}`;

async function submitStagedPayment({ db, caller, data, serverTimestamp, clock = Date.now } = {}) {
  if (!db?.doc || !db?.runTransaction || typeof serverTimestamp !== 'function' || typeof clock !== 'function') refuse('trusted-admin-required');
  const identity = staff(caller, 'payment');
  const now = clock(), input = preparedReceipt(data, now);
  const id = receiptId(identity.uid, input.requestId);
  const counterRef = db.doc(`users/${identity.uid}`), userRef = db.doc(`users/${input.studentId}`);
  const studentRef = db.doc(`students/${input.studentId}`), summaryRef = db.doc(`studentSummaries/${input.studentId}`);
  const ledgerRef = db.doc(`transactions/${id}`), sequenceRef = db.doc(`receiptSequences/${identity.uid}`);
  const refId = input.trxRef ? digest(`${input.method}\0${input.trxRef.toLowerCase()}`) : '';
  const referenceRef = refId ? db.doc(`paymentReferences/${refId}`) : null;
  return db.runTransaction(async tx => {
    const [counterSnap, userSnap, studentSnap, summarySnap, ledgerSnap, seqSnap, refSnap] = await Promise.all([
      tx.get(counterRef), tx.get(userRef), tx.get(studentRef), tx.get(summaryRef),
      tx.get(ledgerRef), tx.get(sequenceRef), referenceRef ? tx.get(referenceRef) : Promise.resolve(null)
    ]);
    if (!staffProfile(counterSnap.exists ? counterSnap.data() : null, identity, 'payment')) refuse('role-denied');
    if (ledgerSnap.exists) {
      const row = ledgerSnap.data();
      if (verifiedReceipt(row, id) && row.createdBy === identity.uid && row.studentId === input.studentId &&
          row.amount === input.amount && row.feeType === input.feeType && row.month === input.month &&
          row.method === input.method && row.trxRef === input.trxRef && row.requestId === input.requestId &&
          row.referenceId === refId && (!referenceRef ||
            (refSnap.exists && refSnap.data().transactionId === id))) {
        const number = await tx.get(db.doc(`receiptNumbers/${row.receiptNo}`));
        if (number.exists && number.data().transactionId === id) {
          return { ok: true, id, receiptNo: row.receiptNo, status: row.status, alreadySubmitted: true };
        }
      }
      refuse('request-reserved');
    }
    const student = studentSnap.exists ? studentSnap.data() : null;
    if (!authorizedStudent(userSnap.exists ? userSnap.data() : null, student, input.studentId) ||
        !summarySnap.exists || !matchesProjection(summarySnap.data(), student, input.studentId)) refuse('student-denied');
    const [year] = data.month.split('-').map(Number);
    const localYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Dhaka', year: 'numeric' }).format(new Date(now)));
    if (year < localYear - 1 || year > localYear + 1) refuse('invalid-payment');
    if (refSnap?.exists) refuse('reference-reserved');
    const sequence = seqSnap.exists ? seqSnap.data() : null;
    const next = sequence ? sequence.last + 1 : 1;
    if (sequence && (sequence.uid !== identity.uid || !Number.isSafeInteger(sequence.last) || sequence.last < 1)) refuse('sequence-corrupt');
    if (!Number.isSafeInteger(next) || next > 99_999_999) refuse('sequence-exhausted');
    const receiptNo = `${receiptPrefix(identity.uid)}-${String(next).padStart(8, '0')}`;
    const numberRef = db.doc(`receiptNumbers/${receiptNo}`);
    const existingNumber = await tx.get(numberRef);
    if (existingNumber.exists) refuse('number-reserved');
    // One server clock snapshot gives the display date and recordedAt the
    // same Dhaka day, including requests that cross midnight before commit.
    const recordedAt = now;
    // New rows start pending. Neither a receipt nor a client token proves
    // settlement; only Manager review can count it as approved revenue.
    const row = { id, requestId: input.requestId, receiptNo, studentId: input.studentId,
      studentName: student.fullName, className: student.className,
      feeType: input.feeType, month: input.month, amount: input.amount,
      method: input.method, trxRef: input.trxRef, referenceId: refId,
      date: input.date, recordedAt, createdAt: serverTimestamp(),
      createdBy: identity.uid, status: 'pending', reviewHistory: [] };
    tx.create(ledgerRef, row);
    tx.create(numberRef, { transactionId: id, createdBy: identity.uid, createdAt: serverTimestamp() });
    if (seqSnap.exists) tx.update(sequenceRef, { last: next });
    else tx.create(sequenceRef, { uid: identity.uid, last: next });
    if (referenceRef) tx.create(referenceRef, { transactionId: id, createdBy: identity.uid, createdAt: serverTimestamp() });
    return { ok: true, id, receiptNo, status: 'pending', alreadySubmitted: false };
  });
}

function verifiedReceipt(row, id) {
  if (!object(row) || row.id !== id || !safeId(row.createdBy) ||
      typeof row.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(row.requestId) ||
      receiptId(row.createdBy, row.requestId) !== id ||
      typeof row.receiptNo !== 'string' || !new RegExp(`^${receiptPrefix(row.createdBy)}-\\d{8}$`).test(row.receiptNo) ||
      !safeId(row.studentId) || !amount(row.amount) || row.amount === 0 ||
      !FEE_TYPES.includes(row.feeType) || !METHODS.includes(row.method) ||
      typeof row.trxRef !== 'string' ||
      (row.method === 'নগদ (Cash)' ? row.trxRef !== '' : !/^[A-Za-z0-9._:/-]{1,120}$/.test(row.trxRef)) ||
      row.referenceId !== (row.trxRef ? digest(`${row.method}\0${row.trxRef.toLowerCase()}`) : '') ||
      !['pending', 'approved', 'rejected'].includes(row.status) || !Array.isArray(row.reviewHistory)) return false;
  return row.status === 'pending' ? row.reviewHistory.length === 0 && !row.reviewedBy
    : row.reviewHistory.length === 1 && row.reviewHistory[0]?.decision === row.status &&
      safeId(row.reviewedBy) && row.reviewHistory[0]?.reviewedBy === row.reviewedBy;
}

async function checkedReceipt(tx, db, row, id) {
  if (!verifiedReceipt(row, id)) refuse('unverified-receipt');
  const [number, reference] = await Promise.all([
    tx.get(db.doc(`receiptNumbers/${row.receiptNo}`)),
    row.referenceId ? tx.get(db.doc(`paymentReferences/${row.referenceId}`)) : Promise.resolve(null)
  ]);
  if (!number.exists || number.data().transactionId !== id ||
      (row.referenceId && (!reference.exists || reference.data().transactionId !== id))) refuse('unverified-receipt');
  return row;
}

/** Manager can inspect one known receipt via a limited server projection,
 * without gaining a direct transactions collection read in Firestore rules. */
async function inspectStagedPayment({ db, caller, id } = {}) {
  if (!db?.doc || !db?.runTransaction) refuse('trusted-admin-required');
  const identity = staff(caller, 'manager');
  if (typeof id !== 'string' || !/^pay_[a-f0-9]{64}$/.test(id)) refuse('invalid-review');
  return db.runTransaction(async tx => {
    const [manager, receipt] = await Promise.all([
      tx.get(db.doc(`users/${identity.uid}`)), tx.get(db.doc(`transactions/${id}`))
    ]);
    if (!staffProfile(manager.exists ? manager.data() : null, identity, 'manager')) refuse('role-denied');
    const row = await checkedReceipt(tx, db, receipt.exists ? receipt.data() : null, id);
    return { ok: true, receipt: { id, receiptNo: row.receiptNo, studentId: row.studentId,
      studentName: row.studentName, feeType: row.feeType, month: row.month,
      amount: row.amount, method: row.method, trxRef: row.trxRef,
      date: row.date, status: row.status } };
  });
}

async function reviewStagedPayment({ db, caller, data, serverTimestamp } = {}) {
  if (!db?.doc || !db?.runTransaction || typeof serverTimestamp !== 'function') refuse('trusted-admin-required');
  const identity = staff(caller, 'manager');
  if (!exact(data, ['id', 'decision', 'note']) || typeof data.id !== 'string' || !/^pay_[a-f0-9]{64}$/.test(data.id) ||
      !['approved', 'rejected'].includes(data.decision)) refuse('invalid-review');
  const note = data.note === undefined ? '' : data.note;
  if (typeof note !== 'string' || note !== note.trim() || note.length > 500 ||
      /[\u0000-\u001f\u007f]/.test(note) || (data.decision === 'rejected' && !note)) refuse('invalid-review');
  const ref = db.doc(`transactions/${data.id}`);
  return db.runTransaction(async tx => {
    const [managerSnap, rowSnap] = await Promise.all([tx.get(db.doc(`users/${identity.uid}`)), tx.get(ref)]);
    if (!staffProfile(managerSnap.exists ? managerSnap.data() : null, identity, 'manager')) refuse('role-denied');
    const row = await checkedReceipt(tx, db, rowSnap.exists ? rowSnap.data() : null, data.id);
    if (row.createdBy === identity.uid) refuse('unverified-receipt');
    if (row.status === data.decision && row.reviewedBy === identity.uid && row.reviewNote === note &&
        row.reviewHistory.length === 1) return { ok: true, id: data.id, status: data.decision, alreadyReviewed: true };
    if (row.status !== 'pending' || row.reviewHistory.length !== 0) refuse('already-reviewed');
    const reviewedAt = serverTimestamp();
    tx.update(ref, { status: data.decision, reviewedBy: identity.uid, reviewedAt, reviewNote: note,
      reviewHistory: [{ decision: data.decision, reason: note, reviewedAt, reviewedBy: identity.uid }] });
    return { ok: true, id: data.id, status: data.decision, alreadyReviewed: false };
  });
}
module.exports = { PaymentError, FEE_TYPES, METHODS, MONTHS, preparedReceipt, receiptId,
  staff, staffProfile, authorizedStudent, matchesProjection, verifiedReceipt, checkedReceipt,
  configureStagedFee, submitStagedPayment, inspectStagedPayment, reviewStagedPayment };
