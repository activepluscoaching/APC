'use strict';

/* Phase 9: one durable accounting correction request per reviewed receipt.
 * Manager requests, different Admin decides; original ledger and cash/refund
 * rails remain untouched. This does NOT execute a payout/processor refund. */
const { PaymentError, staff, staffProfile, verifiedReceipt, checkedReceipt } = require('./staged-payment-core.cjs');
const { safeId } = require('./staged-exam-core.cjs');
const refuse = code => { throw new PaymentError(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
const PAYMENT_ID = /^pay_[a-f0-9]{64}$/;
const reasonText = value => typeof value === 'string' && value === value.trim() &&
  value === value.normalize('NFC') && value.length >= 8 && value.length <= 500 &&
  !/[\u0000-\u001f\u007f]/.test(value);

function verifiedReversal(row, receipt) {
  if (!object(receipt) || !verifiedReceipt(receipt, receipt.id) || receipt.status !== 'approved' ||
      !exact(row, ['schemaVersion', 'id', 'receiptNo', 'studentId', 'feeType', 'month',
        'amount', 'originalCounterUid', 'reason', 'requestedBy', 'requestedAt',
        'state', 'decidedBy', 'decidedAt', 'decisionNote']) ||
      row.schemaVersion !== 1 || row.id !== receipt.id || row.receiptNo !== receipt.receiptNo ||
      row.studentId !== receipt.studentId || row.feeType !== receipt.feeType ||
      row.month !== receipt.month || row.amount !== receipt.amount ||
      row.originalCounterUid !== receipt.createdBy || !safeId(row.requestedBy) ||
      row.requestedBy === row.originalCounterUid || !reasonText(row.reason) ||
      !row.requestedAt || !['pending', 'approved', 'rejected'].includes(row.state)) return false;
  if (row.state === 'pending') return !Object.hasOwn(row, 'decidedBy') &&
    !Object.hasOwn(row, 'decidedAt') && !Object.hasOwn(row, 'decisionNote');
  return safeId(row.decidedBy) && row.decidedBy !== row.requestedBy &&
    row.decidedBy !== row.originalCounterUid && Boolean(row.decidedAt) &&
    reasonText(row.decisionNote);
}

async function requestStagedReversal({ db, caller, data, serverTimestamp } = {}) {
  if (!db?.doc || !db?.runTransaction || typeof serverTimestamp !== 'function') refuse('trusted-admin-required');
  const manager = staff(caller, 'manager');
  if (!exact(data, ['id', 'receiptNo', 'reason']) || typeof data.id !== 'string' ||
      !PAYMENT_ID.test(data.id) || typeof data.receiptNo !== 'string' ||
      !/^FC[A-F0-9]{12}-\d{8}$/.test(data.receiptNo) || !reasonText(data.reason)) refuse('invalid-request');
  const receiptRef = db.doc(`transactions/${data.id}`), reversalRef = db.doc(`paymentReversals/${data.id}`);
  return db.runTransaction(async tx => {
    const [profileSnap, receiptSnap, priorSnap] = await Promise.all([
      tx.get(db.doc(`users/${manager.uid}`)), tx.get(receiptRef), tx.get(reversalRef)
    ]);
    if (!staffProfile(profileSnap.exists ? profileSnap.data() : null, manager, 'manager')) refuse('role-denied');
    const receipt = await checkedReceipt(tx, db, receiptSnap.exists ? receiptSnap.data() : null, data.id);
    if (receipt.status !== 'approved' || receipt.receiptNo !== data.receiptNo ||
        receipt.createdBy === manager.uid) refuse('unverified-receipt');
    if (priorSnap.exists) {
      const prior = priorSnap.data();
      if (verifiedReversal(prior, receipt) && prior.requestedBy === manager.uid &&
          prior.reason === data.reason) {
        return { ok: true, id: data.id, state: prior.state, alreadyRequested: true };
      }
      refuse('reversal-reserved');
    }
    tx.create(reversalRef, { schemaVersion: 1, id: data.id, receiptNo: receipt.receiptNo,
      studentId: receipt.studentId, feeType: receipt.feeType, month: receipt.month,
      amount: receipt.amount, originalCounterUid: receipt.createdBy,
      reason: data.reason, requestedBy: manager.uid, requestedAt: serverTimestamp(),
      state: 'pending' });
    return { ok: true, id: data.id, state: 'pending', alreadyRequested: false };
  });
}

async function decideStagedReversal({ db, caller, data, serverTimestamp } = {}) {
  if (!db?.doc || !db?.runTransaction || typeof serverTimestamp !== 'function') refuse('trusted-admin-required');
  const admin = staff(caller, 'admin');
  if (!exact(data, ['id', 'decision', 'note']) || typeof data.id !== 'string' ||
      !PAYMENT_ID.test(data.id) || !['approved', 'rejected'].includes(data.decision) ||
      !reasonText(data.note)) refuse('invalid-decision');
  const receiptRef = db.doc(`transactions/${data.id}`), reversalRef = db.doc(`paymentReversals/${data.id}`);
  return db.runTransaction(async tx => {
    const [profileSnap, receiptSnap, reversalSnap] = await Promise.all([
      tx.get(db.doc(`users/${admin.uid}`)), tx.get(receiptRef), tx.get(reversalRef)
    ]);
    if (!staffProfile(profileSnap.exists ? profileSnap.data() : null, admin, 'admin')) refuse('role-denied');
    const receipt = await checkedReceipt(tx, db, receiptSnap.exists ? receiptSnap.data() : null, data.id);
    const reversal = reversalSnap.exists ? reversalSnap.data() : null;
    if (!verifiedReversal(reversal, receipt) || reversal.requestedBy === admin.uid ||
        reversal.originalCounterUid === admin.uid) refuse('unverified-reversal');
    if (reversal.state === data.decision && reversal.decidedBy === admin.uid &&
        reversal.decisionNote === data.note) {
      return { ok: true, id: data.id, state: data.decision, alreadyDecided: true };
    }
    if (reversal.state !== 'pending') refuse('reversal-reserved');
    tx.update(reversalRef, { state: data.decision, decidedBy: admin.uid,
      decidedAt: serverTimestamp(), decisionNote: data.note });
    return { ok: true, id: data.id, state: data.decision, alreadyDecided: false };
  });
}

/** Pure ledger projection for FUTURE verified reconciliation. Never use the
 * old local money.sum over raw receipts: only approved originals without an
 * approved reversal contribute positive money. A malformed pair fails shut. */
function netApprovedAmount(receipt, reversal = null) {
  if (!receipt || !verifiedReceipt(receipt, receipt.id)) refuse('unverified-receipt');
  if (reversal !== null && !verifiedReversal(reversal, receipt)) refuse('unverified-reversal');
  return receipt.status === 'approved' && (!reversal || reversal.state !== 'approved') ? receipt.amount : 0;
}

module.exports = { verifiedReversal, requestStagedReversal, decideStagedReversal, netApprovedAmount };
