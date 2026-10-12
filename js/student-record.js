/* Presentation only: show complete stored values without changing the record. */
import { escapeHtml } from './sanitize.js';
import { toBanglaNumber } from './ui.js';
import { classCodes } from './admin-data.js';

const display = value => escapeHtml(String(value ?? '').trim() || 'তথ্য দেওয়া হয়নি');
const number = value => display(value === null || value === undefined || value === '' ? '' : toBanglaNumber(value));
const field = (label, value, className = '') => `
  <div class="student-record-field ${className}"><dt>${label}</dt><dd>${value}</dd></div>`;
const section = (id, title, fields) => `
  <section class="student-record-section" aria-labelledby="${id}">
    <h3 id="${id}">${title}</h3><dl class="student-record-fields">${fields}</dl>
  </section>`;

export function studentRecordMarkup(student) {
  const statuses = {
    approved: ['অনুমোদিত', 'approved'], pending: ['অপেক্ষমাণ', 'pending'], rejected: ['বাতিল', 'rejected']
  };
  const status = Object.hasOwn(statuses, student.status) ? statuses[student.status] : ['স্ট্যাটাস অজানা', 'unknown'];
  const id = String(student.id ?? '');
  const classCode = classCodes[student.className] || 'CLS-GEN';
  const percent = value => Number.isFinite(Number(value)) && value !== null && value !== '' && value !== undefined
    ? `${number(value)}%` : 'তথ্য দেওয়া হয়নি';
  return `
    <div class="student-record-content" tabindex="0" role="region" aria-label="শিক্ষার্থীর বিস্তারিত তথ্য">
      <div class="student-record-summary">
        <span class="student-record-status student-record-status--${status[1]}"><span aria-hidden="true">●</span> ${status[0]}</span>
        <span class="student-record-class">${display(student.className)}</span>
      </div>
      <section class="student-record-identity" aria-label="রেকর্ড পরিচিতি">
        <dl class="student-record-identifiers">
          ${field('শিক্ষার্থী আইডি', `<code dir="ltr">${display(id)}</code>`)}
          ${field('অডিট ট্র্যাকিং কোড', `<code dir="ltr">${id ? escapeHtml('AUD-STU-' + id.replace(/[^0-9A-Za-z]/g, '')) : 'তথ্য দেওয়া হয়নি'}</code>`)}
        </dl>
      </section>
      ${section('studentRecordPersonal', 'ব্যক্তিগত তথ্য',
        field('নাম (বাংলা)', display(student.name)) + field('নাম (English)', display(student.nameEn)) +
        field('পিতার নাম', display(student.fatherName)) + field('বিভাগ / গ্রুপ', display(student.group)))}
      ${section('studentRecordContact', 'যোগাযোগ',
        field('মোবাইল নম্বর', number(student.mobile), 'student-record-phone') +
        field('অভিভাবকের মোবাইল', number(student.guardianMobile), 'student-record-phone') +
        field('ঠিকানা', display(student.address), 'student-record-field--wide'))}
      ${section('studentRecordEnrollment', 'ভর্তি ও একাডেমিক তথ্য',
        field('শ্রেণি', `${display(student.className)} <span class="student-record-class-code">${escapeHtml(classCode)}</span>`) +
        field('রেজিস্ট্রেশনের তারিখ', display(student.enrolledAt)) + field('সর্বশেষ সক্রিয়', display(student.lastActive)) +
        (student.status === 'approved'
          ? field('অগ্রগতি', `উপস্থিতি ${percent(student.attendance)}<br>গড় ফলাফল ${percent(student.average)}`)
          : field('অগ্রগতি', 'অনুমোদনের পরে দেখা যাবে')))}
    </div>
    <div class="modal-actions student-record-actions">
      <button class="admin-btn primary" type="button" data-modal-action="edit">সম্পাদনা করুন</button>
      <button class="admin-btn ghost" type="button" data-modal-action="reset-pin">পাসওয়ার্ড রিসেট</button>
    </div>`;
}
