/* Student registration review — one decision path for Admin and Manager.
 *
 * Owner decision 2026-09-30: the Admin may approve/reject a registration as
 * well as the Manager. Both panels (and a tapped "new registration"
 * notification) use this module, so the decision is recorded identically:
 * the roster row changes status, the reviewer is stamped, and the synced
 * `students` collection carries the result to every device — including the
 * student's own phone, which unlocks itself (js/main.js storage handler).
 *
 * The dialog is built on demand with the shared modal classes, so it looks the
 * same on both panels and needs no page markup.
 */
import { loadRoster, saveRoster, syncAccountStatus } from './office-data.js';
import { hasStaffSession, readStaffAccount } from './staff-auth.js';
import { escapeHtml } from './sanitize.js';

export const REVIEW_ROLES = Object.freeze(['admin', 'manager']);
export const REVIEW_DIALOG_ID = 'apcRegistrationReview';
export const DECIDED_EVENT = 'apc-registration-decided';

let busy = false;

async function reviewerName(role) {
  try {
    const account = await readStaffAccount(role);
    return String(account?.username || role);
  } catch { return role; }
}

/**
 * Record a decision on one pending registration.
 * @returns {Promise<{ok: boolean, reason?: string, student?: object}>}
 */
export async function decideRegistration(studentId, decision, { role, note = '' } = {}) {
  if (!['approved', 'rejected'].includes(decision)) return { ok: false, reason: 'bad-decision' };
  if (!REVIEW_ROLES.includes(role)) return { ok: false, reason: 'not-allowed' };
  if (!(await hasStaffSession(role))) return { ok: false, reason: 'no-session' };
  const reason = String(note || '').trim();
  if (decision === 'rejected' && !reason) return { ok: false, reason: 'note-required' };
  if (busy) return { ok: false, reason: 'busy' };
  busy = true;
  try {
    const students = loadRoster();
    const index = students.findIndex(row => row?.id === studentId);
    if (index < 0) return { ok: false, reason: 'not-found' };
    if (students[index].status !== 'pending') return { ok: false, reason: 'already-decided', student: students[index] };
    const student = {
      ...students[index],
      status: decision,
      reviewedAt: new Date().toISOString(),
      reviewedBy: await reviewerName(role),
      reviewedRole: role,
      updatedAt: new Date().toISOString()
    };
    if (reason) student.reviewNote = reason;
    const next = students.map((row, i) => (i === index ? student : row));
    if (!saveRoster(next)) return { ok: false, reason: 'save-failed' };
    await syncAccountStatus(studentId, decision);
    window.dispatchEvent(new CustomEvent(DECIDED_EVENT, { detail: { studentId, decision, role } }));
    return { ok: true, student };
  } finally {
    busy = false;
  }
}

export const DECISION_MESSAGES = Object.freeze({
  'not-allowed': 'এই প্যানেল থেকে রেজিস্ট্রেশনের সিদ্ধান্ত নেওয়া যায় না।',
  'no-session': 'সেশন যাচাই হয়নি। আবার প্রবেশ করুন।',
  'note-required': 'বাতিলের কারণ লিখুন।',
  busy: 'আগের সিদ্ধান্ত সংরক্ষণ হচ্ছে, একটু অপেক্ষা করুন।',
  'not-found': 'এই শিক্ষার্থীকে তালিকায় পাওয়া যায়নি।',
  'already-decided': 'এই রেজিস্ট্রেশনে আগেই সিদ্ধান্ত নেওয়া হয়েছে।',
  'save-failed': 'সিদ্ধান্ত সংরক্ষণ হয়নি। স্টোরেজ পরীক্ষা করুন।',
  'bad-decision': 'অজানা সিদ্ধান্ত।'
});

const STATUS_TEXT = Object.freeze({ approved: 'অনুমোদিত', rejected: 'বাতিল', pending: 'অপেক্ষমাণ' });

function row(label, value) {
  const text = String(value ?? '').trim();
  return text ? `<div class="apc-review-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(text)}</dd></div>` : '';
}

function closeDialog() {
  document.getElementById(REVIEW_DIALOG_ID)?.remove();
  document.body.classList.remove('modal-open');
}

/**
 * Open the review dialog for one student.
 * @param {string} studentId
 * @param {{ role: string, onLater?: Function, onDone?: Function }} options
 * @returns {Promise<boolean>} whether a dialog was opened
 */
export async function openRegistrationReview(studentId, { role, onLater, onDone } = {}) {
  closeDialog();
  if (!REVIEW_ROLES.includes(role) || !(await hasStaffSession(role))) return false;
  const student = loadRoster().find(item => item?.id === studentId);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = REVIEW_DIALOG_ID;
  const pending = student?.status === 'pending';
  const heading = student ? escapeHtml(student.name || student.nameEn || 'নাম নেই') : 'শিক্ষার্থী পাওয়া যায়নি';
  backdrop.innerHTML =
    '<section class="modal" role="dialog" aria-modal="true" aria-labelledby="apcReviewTitle">' +
      '<div class="modal-header"><div><p class="eyebrow">শিক্ষার্থী রেজিস্ট্রেশন</p>' +
      `<h2 id="apcReviewTitle">${heading}</h2></div>` +
      '<button type="button" class="modal-close" data-review-close aria-label="বন্ধ করুন">×</button></div>' +
      (student
        ? '<dl class="apc-review-details">' +
            row('Student ID', student.id) +
            row('অবস্থা', STATUS_TEXT[student.status] || student.status) +
            row('শ্রেণি', student.className) +
            row('বিভাগ / গ্রুপ', student.group) +
            row('পিতার নাম', student.fatherName) +
            row('মোবাইল', student.mobile) +
            row('অভিভাবকের মোবাইল', student.guardianMobile) +
            row('ঠিকানা', student.address) +
            row('আবেদনের তারিখ', student.enrolledAt) +
            (pending ? '' : row('সিদ্ধান্ত নিয়েছেন', [student.reviewedBy, student.reviewedRole].filter(Boolean).join(' • '))) +
            (pending ? '' : row('কারণ', student.reviewNote)) +
          '</dl>'
        : '<p class="form-note">রেকর্ডটি এখনও এই ডিভাইসে আসেনি বা মুছে গেছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।</p>') +
      (pending
        ? '<label for="apcReviewNote">বাতিলের কারণ <span>(শুধু বাতিল করলে আবশ্যক)</span></label>' +
          '<textarea id="apcReviewNote" maxlength="300" rows="2" placeholder="যেমন: তথ্য অসম্পূর্ণ"></textarea>' +
          '<p class="form-note" data-review-status role="status" aria-live="polite"></p>' +
          '<div class="modal-actions">' +
            '<button type="button" class="mini-btn approve primary" data-review-decision="approved">✓ অনুমোদন করুন</button>' +
            '<button type="button" class="mini-btn reject danger" data-review-decision="rejected">✕ বাতিল করুন</button>' +
            '<button type="button" class="mini-btn" data-review-later>পরে দেখব</button>' +
          '</div>'
        : '<p class="form-note" data-review-status role="status">' +
            (student ? 'এই রেজিস্ট্রেশনে আর কোনো সিদ্ধান্ত বাকি নেই।' : '') + '</p>' +
          '<button class="modal-action" type="button" data-review-close>ঠিক আছে</button>') +
    '</section>';
  document.body.append(backdrop);
  document.body.classList.add('modal-open');

  const status = backdrop.querySelector('[data-review-status]');
  const say = message => { if (status) status.textContent = message; };
  backdrop.addEventListener('click', async event => {
    if (event.target === backdrop || event.target.closest('[data-review-close]')) { closeDialog(); return; }
    if (event.target.closest('[data-review-later]')) { closeDialog(); onLater?.(studentId); return; }
    const button = event.target.closest('[data-review-decision]');
    if (!button) return;
    const decision = button.dataset.reviewDecision;
    const note = backdrop.querySelector('#apcReviewNote')?.value || '';
    if (decision === 'rejected' && !note.trim()) {
      say(DECISION_MESSAGES['note-required']);
      backdrop.querySelector('#apcReviewNote')?.focus();
      return;
    }
    backdrop.querySelectorAll('button').forEach(item => { item.disabled = true; });
    say('সংরক্ষণ হচ্ছে…');
    const result = await decideRegistration(studentId, decision, { role, note });
    if (!result.ok) {
      say(DECISION_MESSAGES[result.reason] || 'সিদ্ধান্ত সংরক্ষণ হয়নি।');
      backdrop.querySelectorAll('button').forEach(item => { item.disabled = false; });
      return;
    }
    closeDialog();
    onDone?.(result);
  });
  backdrop.addEventListener('keydown', event => { if (event.key === 'Escape') closeDialog(); });
  (backdrop.querySelector('[data-review-decision]') || backdrop.querySelector('[data-review-close]'))?.focus?.();
  return true;
}
