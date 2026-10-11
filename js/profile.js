/* Profile feature: editable student information with an immutable Student ID.
   Updated: toggle to disable security check every time. */
import { $, openModal, closeModal, showFeedback, normalizeMobile } from './ui.js';
import { enabledClasses } from './config.js';
import { appendAccountMobile } from './account-policy.js';
import { loadAccount, saveStudent, persistAccount, isTrustedDevice, setTrustedDevice, hasSession, persistSession, generateClassRoll } from './storage.js';
import { upsertStudentRosterRow } from './office-data.js';

export function populateProfileClassOptions() {
  const select = $('#classInput');
  if (!select) return;
  select.innerHTML = enabledClasses.map(className => `<option value="${className}">${className}</option>`).join('');
}

function setValue(id, value = '') {
  const field = $(`#${id}`);
  if (field) field.value = value || '';
}

export function openProfileEditor(student) {
  setValue('editStudentId', student.id);
  setValue('editNameBn', student.nameBn || student.name);
  setValue('editNameEn', student.nameEn);
  setValue('editFatherName', student.fatherName);
  setValue('editMotherName', student.motherName);
  setValue('editGuardianName', student.guardianName);
  setValue('editBirthDate', student.birthDate);
  setValue('editGender', student.gender);
  const account = loadAccount();
  setValue('editStudentMobile', account?.registrationMobile || account?.mobile || student.studentMobile);
  // The username is permanent: shown locked, never read back from the form.
  setValue('editUsername', account?.username || student.username || '');
  const usernameNote = $('#editUsernameNote');
  if (usernameNote) {
    usernameNote.textContent = (account?.username || student.username)
      ? 'ইউজারনেম স্থায়ী — বদলানো যাবে না। লগইনে এটি ব্যবহার করলে মোবাইল নম্বর দিতে হয় না।'
      : 'এই অ্যাকাউন্টে ইউজারনেম নেই; পুরোনো অ্যাকাউন্টে মোবাইল নম্বর দিয়েই লগইন হবে।';
  }
  setValue('editAdditionalMobile', '');
  $('#editAdditionalMobiles').textContent = (account?.additionalMobiles || []).join(' • ') || 'এখনও অতিরিক্ত নম্বর নেই';
  setValue('editGuardianMobile', student.guardianMobile);
  setValue('editAddress', student.address);
  setValue('classInput', student.className);
  setValue('editGroup', student.group);
  setValue('editMajor', student.major);
  setValue('editInstitution', student.institution);
  setValue('editRoll', student.roll);
  setValue('editRegistrationNo', student.registrationNo);
  openModal('editModal');
}

function readEditableStudent(form, current) {
  return {
    ...current,
    // ID and registration number are fixed: copied from current state, never read from a form field.
    id: current.id,
    name: String(form.get('nameBn') || '').trim(),
    nameBn: String(form.get('nameBn') || '').trim(),
    nameEn: String(form.get('nameEn') || '').trim(),
    fatherName: String(form.get('fatherName') || '').trim(),
    motherName: String(form.get('motherName') || '').trim(),
    guardianName: String(form.get('guardianName') || '').trim(),
    birthDate: String(form.get('birthDate') || ''),
    gender: String(form.get('gender') || ''),
    studentMobile: current.studentMobile,
    // Immutable identifiers: never taken from the form.
    username: current.username,
    guardianMobile: normalizeMobile(form.get('guardianMobile')),
    address: String(form.get('address') || '').trim(),
    className: String(form.get('className') || ''),
    group: String(form.get('group') || '').trim(),
    major: String(form.get('major') || '').trim(),
    institution: String(form.get('institution') || '').trim(),
    roll: String(form.get('className') || '') === current.className ? current.roll : generateClassRoll(String(form.get('className') || '')),
    registrationNo: current.registrationNo
  };
}

export function shareStudentOnWhatsApp(student) {
  const rawMobile = normalizeMobile(student.studentMobile);
  if (rawMobile.length < 10) {
    showFeedback('প্রোফাইলে শিক্ষার্থীর মোবাইল নম্বর যোগ করুন');
    return;
  }
  const whatsappNumber = rawMobile.startsWith('0') ? `880${rawMobile.slice(1)}` : rawMobile;
  const message = [
    'Active Plus Coaching শিক্ষার্থী তথ্য',
    `নাম: ${student.name || '—'}`,
    `Student ID: ${student.id || '—'}`,
    `শ্রেণি: ${student.className || '—'}`,
    `বিভাগ: ${student.group || '—'}`
  ].join('\n');
  window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

function initSecurityToggle() {
  const trustedToggle = $('#trustedDeviceToggle');
  if (trustedToggle) {
    trustedToggle.checked = isTrustedDevice();
    trustedToggle.addEventListener('change', async () => {
      // A preference may extend an authenticated session, never create one.
      if (!(await hasSession())) {
        trustedToggle.checked = false;
        return;
      }
      setTrustedDevice(trustedToggle.checked);
      if (trustedToggle.checked) {
        void persistSession(true);
        showFeedback('এই ডিভাইসটি বিশ্বস্ত হিসেবে সংরক্ষিত');
      } else {
        showFeedback('বিশ্বস্ত ডিভাইস বন্ধ করা হয়েছে');
      }
    });
  }
}

export function initProfile({ state, onStudentChange }) {
  populateProfileClassOptions();
  initSecurityToggle();
  $('#profileForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!event.currentTarget.reportValidity()) return;
    const account = loadAccount() || state.account;
    if (!account) return showFeedback('অ্যাকাউন্ট পাওয়া যায়নি। আবার লগইন করুন।');
    let nextAccount;
    try {
      nextAccount = form.get('additionalMobile')?.trim() ? appendAccountMobile(account, form.get('additionalMobile')) : account;
    } catch (error) { return showFeedback(error.message); }
    const student = readEditableStudent(form, { ...state.student, studentMobile: account.registrationMobile || account.mobile });
    nextAccount = { ...nextAccount, student };
    let saved;
    try { saved = await persistAccount(nextAccount); }
    catch { return showFeedback('সংরক্ষণ হয়নি। স্টোরেজ পরীক্ষা করে আবার চেষ্টা করুন।'); }
    state.account = saved;
    state.student = state.account.student;
    saveStudent(state.student);
    // The device profile is not shared; the roster row is. Without this the
    // Admin / Manager / Cash Counter panels on other devices would keep the old
    // name, class and mobile for this student.
    upsertStudentRosterRow();
    onStudentChange?.(state.student);
    closeModal('editModal');
    showFeedback('প্রোফাইলের তথ্য সংরক্ষণ হয়েছে');
  });
}
