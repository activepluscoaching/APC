'use strict';

/* Phase 10: bounded, Admin-only, read-only reconciliation of staged receipts.
 * A transaction reads one Student's entire receipt set plus each receipt's
 * reserved number/reference and one-per-receipt correction. Never use this
 * as a live balance or expose it to the local/browser finance adapter. */
const { safeId } = require('./staged-exam-core.cjs');
const { PaymentError, MONTHS, staff, staffProfile, authorizedStudent,
  matchesProjection, checkedReceipt } = require('./staged-payment-core.cjs');
const { netApprovedAmount } = require('./staged-reversal-core.cjs');
const refuse = code => { throw new PaymentError(code); };
const LIMIT = 100;
const exact = (data, keys) => data !== null && typeof data === 'object' && !Array.isArray(data) &&
  Object.keys(data).every(key => keys.includes(key));
const banglaDigits = n => String(n).replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[digit]);
function targetMonth(value) {
  if (typeof value !== 'string' || !/^(20\d\d|2100)-(0[1-9]|1[0-2])$/.test(value)) refuse('invalid-month');
  const [year, month] = value.split('-').map(Number);
  return `${MONTHS[month - 1]} ${banglaDigits(year)}`;
}
const VALID_MONTH = new RegExp(`^(?:${MONTHS.join('|')}) [০-৯]{4}$`);
function dhakaMonth(epoch) {
  if (!Number.isSafeInteger(epoch)) refuse('fee-period-unverified');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit'
  }).formatToParts(new Date(epoch)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}`;
}
function add(a, b) {
  const value = a + b;
  if (!Number.isSafeInteger(value)) refuse('amount-overflow');
  return value;
}
function summarizeVerifiedRows({ studentId, month, monthlyFee, entries }) {
  if (!safeId(studentId) || !Number.isSafeInteger(monthlyFee) || monthlyFee < 0 ||
      monthlyFee > 10_000_000 || !Array.isArray(entries) || entries.length > LIMIT) refuse('unverified-ledger');
  const label = targetMonth(month);
  let approvedGross = 0, approvedReversed = 0, netPaid = 0, tuitionPaid = 0, pendingAmount = 0;
  let approvedCount = 0, reversedCount = 0, pendingCount = 0, rejectedCount = 0;
  for (const { receipt, reversal } of entries) {
    // Caller must have checked the receipt's server number, processor reference
    // and reversal doc in the SAME read-only Firestore transaction. This pure
    // reduction additionally checks shapes/links and rejects foreign rows.
    if (receipt?.studentId !== studentId || !VALID_MONTH.test(receipt.month || '')) refuse('unverified-ledger');
    const net = netApprovedAmount(receipt, reversal);
    if (receipt.month !== label) continue;
    if (receipt.status === 'pending') {
      pendingAmount = add(pendingAmount, receipt.amount);
      pendingCount++;
    } else if (receipt.status === 'rejected') {
      rejectedCount++;
    } else {
      approvedCount++;
      approvedGross = add(approvedGross, receipt.amount);
      if (reversal?.state === 'approved') {
        approvedReversed = add(approvedReversed, receipt.amount);
        reversedCount++;
      }
      netPaid = add(netPaid, net);
      if (receipt.feeType === 'মাসিক বেতন') tuitionPaid = add(tuitionPaid, net);
    }
  }
  // Pending receipts never reduce due. Other approved fee types contribute to
  // netPaid but only tuition credits reduce this month's configured tuition.
  return { ok: true, studentId, month, monthlyFee, approvedGross,
    approvedReversed, netPaid, tuitionPaid, due: Math.max(0, monthlyFee - tuitionPaid),
    pendingAmount, approvedCount, reversedCount, pendingCount, rejectedCount };
}

async function readStagedPaymentPosition({ db, caller, data, clock = Date.now } = {}) {
  if (!db?.doc || !db?.collection || !db?.runTransaction || typeof clock !== 'function') refuse('trusted-admin-required');
  const admin = staff(caller, 'admin');
  if (!exact(data, ['studentId', 'month']) || !safeId(data.studentId)) refuse('invalid-student');
  targetMonth(data.month);
  const currentMonth = dhakaMonth(clock());
  return db.runTransaction(async tx => {
    const adminSnap = await tx.get(db.doc(`users/${admin.uid}`));
    if (!staffProfile(adminSnap.exists ? adminSnap.data() : null, admin, 'admin')) refuse('role-denied');
    const [userSnap, studentSnap, summarySnap] = await Promise.all([
      tx.get(db.doc(`users/${data.studentId}`)), tx.get(db.doc(`students/${data.studentId}`)),
      tx.get(db.doc(`studentSummaries/${data.studentId}`))
    ]);
    const student = studentSnap.exists ? studentSnap.data() : null;
    if (!authorizedStudent(userSnap.exists ? userSnap.data() : null, student, data.studentId) ||
        !summarySnap.exists || !matchesProjection(summarySnap.data(), student, data.studentId)) refuse('student-denied');
    // No historical rate schedule exists. Showing the present monthlyFee as
    // an old or future month's actual due would invent an agreement.
    const effective = dhakaMonth(summarySnap.data().configuredAt?.toMillis?.());
    if (data.month < effective || data.month > currentMonth) refuse('fee-period-unverified');
    // Query ALL months, not just the requested one. A legacy/forged row for
    // this Student must not be silently omitted from the accounting boundary.
    // A 101st row refuses the report rather than returning a partial total.
    const query = db.collection('transactions').where('studentId', '==', data.studentId).limit(LIMIT + 1);
    const correctionsQuery = db.collection('paymentReversals').where('studentId', '==', data.studentId).limit(LIMIT + 1);
    const [snapshot, corrections] = await Promise.all([tx.get(query), tx.get(correctionsQuery)]);
    if (!snapshot || !Array.isArray(snapshot.docs) || snapshot.docs.length > LIMIT ||
        !corrections || !Array.isArray(corrections.docs) || corrections.docs.length > LIMIT) refuse('ledger-too-large');
    const seen = new Set(), entries = [];
    for (const doc of snapshot.docs) {
      if (!doc || typeof doc.id !== 'string' || seen.has(doc.id)) refuse('unverified-ledger');
      seen.add(doc.id);
      const receipt = await checkedReceipt(tx, db, doc.data(), doc.id);
      if (receipt.studentId !== data.studentId) refuse('unverified-ledger');
      const correctionSnap = await tx.get(db.doc(`paymentReversals/${doc.id}`));
      const reversal = correctionSnap.exists ? correctionSnap.data() : null;
      entries.push({ receipt, reversal });
    }
    // A correction whose original receipt disappeared must not be silently
    // dropped from the financial picture. Both queries share one read snapshot.
    const correctionIds = new Set();
    for (const correction of corrections.docs) {
      if (!correction || typeof correction.id !== 'string' || !seen.has(correction.id) ||
          correctionIds.has(correction.id)) refuse('unverified-ledger');
      correctionIds.add(correction.id);
    }
    if (entries.filter(item => item.reversal !== null).length !== correctionIds.size) refuse('unverified-ledger');
    return summarizeVerifiedRows({ studentId: data.studentId, month: data.month,
      monthlyFee: summarySnap.data().monthlyFee, entries });
  });
}

module.exports = { LIMIT, targetMonth, summarizeVerifiedRows, readStagedPaymentPosition };
