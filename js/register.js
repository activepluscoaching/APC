import { LEGACY_CLOUD_ENABLED } from '../sync/cloud-access.js';
/* Registration feature: step-by-step student self-registration with auto Student ID.
   Registration saves the account; entry still requires a submitted login.
   The student also picks a permanent username here — a login ID that never
   changes, so the phone number does not have to be shared to log in. */
import { $, $$, normalizeMobile, normalizeAnswer, setAuthMessage, showFeedback } from './ui.js';
import { enabledClasses } from './config.js';
import { contactNumber, isContactNumber, normalizeUsername, usernameError, suggestUsername } from './account-policy.js';
import {
  saveAccount, saveStudent, generateStudentId, generateClassRoll, usernameTaken, reserveUsername, releaseUsername, loadAccount
} from './storage.js';
import { upsertStudentRosterRow } from './office-data.js';
import { listDocuments } from './database.js';
import { switchAuthTab } from './login.js';

function populateRegistrationClasses() {
  const select = $('#regClass');
  if (!select) return;
  select.insertAdjacentHTML('beforeend', enabledClasses.map(className => `<option value="${className}">${className}</option>`).join(''));
}

export function toggleMajorField() {
  const isHonours = ($('#regClass')?.value || '').includes('অনার্স');
  const field = $('#majorField');
  if (field) field.hidden = !isHonours;
  if ($('#major')) $('#major').required = isHonours;
}

function initFixedContactMobile() {
  const loginMobile = $('#regMobile');
  const contactMobile = $('#studentMobile');
  if (!loginMobile || !contactMobile) return;
  const sync = () => { contactMobile.value = loginMobile.value; };
  loginMobile.addEventListener('input', sync);
  sync();
}

/* Live username feedback: the name is permanent, so the rule shows while typing. */
function initUsernameField() {
  const field = $('#regUsername');
  if (!field) return;
  const status = $('#regUsernameStatus');
  const setStatus = (message, ok) => {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-ok', Boolean(ok));
    status.classList.toggle('is-bad', !ok);
  };
  const check = () => {
    const typed = normalizeUsername(field.value);
    field.setCustomValidity('');
    if (!typed) { setStatus('', false); return true; }
    const problem = usernameError(typed);
    if (problem) { setStatus(problem, false); return false; }
    if (usernameTaken(typed)) {
      const message = 'এই ইউজারনেমটি আগেই নেওয়া হয়েছে — অন্য একটি বেছে নিন।';
      setStatus(message, false);
      return false;
    }
    setStatus('✓ এই ইউজারনেমটি নেওয়া যাবে', true);
    return true;
  };
  field.addEventListener('input', check);
  field.addEventListener('blur', () => {
    // Normalise once the field loses focus; the stored form is lowercase.
    const typed = normalizeUsername(field.value);
    if (typed && !usernameError(typed)) field.value = typed;
    check();
  });
  $('#regUsernameSuggest')?.addEventListener('click', () => {
    const from = suggestUsername($('#nameEn')?.value, $('#nameBn')?.value);
    if (!from || usernameError(from)) return setStatus('আগে ইংরেজি নাম লিখুন, তারপর সাজেশন নিন।', false);
    let candidate = from;
    let suffix = 2;
    while (usernameTaken(candidate) && suffix < 100) candidate = `${from.slice(0, 17)}${suffix++}`;
    field.value = candidate;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
  });
  return check;
}

/* The claimed login IDs live in the cloud as well as here. A device that has
   not synced yet must not take a name another student already owns, so the
   cloud is asked before the local claim is written. Best effort: an offline or
   failed lookup answers null and never blocks local-first registration (the
   bridge's own merge guard still protects the other student's record). */
async function checkUsernameOnline(username) {
  if (!LEGACY_CLOUD_ENABLED) return null;
  if (!navigator.onLine) return null;
  const budget = 4000;
  const bounded = promise => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('lookup timed out')), budget))
  ]);
  try {
    const bridge = await bounded(import('./realtime-sync.js'));
    return await bounded(bridge.usernameTakenOnline(username));
  } catch (error) {
    console.warn('[Active Plus] cloud login-id check unavailable:', error.message);
    return null;
  }
}

async function handleRegistration(event, state, onRegistered) {
  event.preventDefault();
  const formElement = event.currentTarget;
  if (!formElement.checkValidity()) {
    formElement.reportValidity();
    return;
  }
  const form = new FormData(formElement);
  const mobile = contactNumber(form.get('mobile'));
  const pin = String(form.get('pin') || '');
  const pinConfirm = String(form.get('pinConfirm') || '');
  const username = normalizeUsername(form.get('username'));
  if (!isContactNumber(mobile)) return setAuthMessage('সঠিক মোবাইল নম্বর দিন।');
  const usernameProblem = usernameError(username);
  if (usernameProblem) return setAuthMessage(usernameProblem);
  if (usernameTaken(username)) return setAuthMessage('এই ইউজারনেমটি আগেই নেওয়া হয়েছে। অন্য একটি বেছে নিন — এটি পরে বদলানো যাবে না।');
  if ((await checkUsernameOnline(username))?.taken) {
    return setAuthMessage('এই ইউজারনেমটি অন্য একটি ডিভাইসে আগেই নেওয়া হয়েছে। অন্য একটি বেছে নিন — এটি পরে বদলানো যাবে না।');
  }
  if (!/^\d{4,6}$/.test(pin)) return setAuthMessage('পাসওয়ার্ড অবশ্যই ৪ থেকে ৬ সংখ্যার হতে হবে।');
  if (pin !== pinConfirm) return setAuthMessage('দুটি পাসওয়ার্ড এক নয়। আবার মিলিয়ে দিন।');
  if (state.account) return setAuthMessage('এই ডিভাইসে ইতিমধ্যে একটি অ্যাকাউন্ট আছে। লগইন করুন অথবা এডমিনের সাহায্য নিন।');

  const className = String(form.get('className') || '');
  // The Student ID is the permanent tracking key every panel searches by, so
  // one that this device already holds is never handed out twice. (A new id
  // ends with a random suffix, making a collision practically impossible —
  // this is the belt to its braces.)
  const issuedIds = new Set(listDocuments('students').map(student => student?.id).filter(Boolean));
  if (loadAccount()?.student?.id) issuedIds.add(loadAccount().student.id);
  let studentId = generateStudentId();
  for (let guard = 0; guard < 5 && issuedIds.has(studentId); guard += 1) studentId = generateStudentId();
  const studentData = {
    name: String(form.get('nameBn') || '').trim(),
    nameBn: String(form.get('nameBn') || '').trim(),
    nameEn: String(form.get('nameEn') || '').trim(),
    className,
    group: String(form.get('group') || ''),
    id: studentId,
    username,
    fatherName: String(form.get('fatherName') || '').trim(),
    motherName: String(form.get('motherName') || '').trim(),
    guardianName: String(form.get('guardianName') || '').trim(),
    birthDate: String(form.get('birthDate') || ''),
    gender: String(form.get('gender') || ''),
    studentMobile: mobile,
    guardianMobile: normalizeMobile(form.get('guardianMobile')),
    address: String(form.get('address') || '').trim(),
    major: String(form.get('major') || '').trim(),
    institution: String(form.get('institution') || '').trim(),
    roll: generateClassRoll(className),
    registrationNo: String(form.get('registrationNo') || '').trim()
  };

  const account = {
    mobile,
    registrationMobile: mobile,
    additionalMobiles: [],
    username,
    pin,
    securityQuestion: String(form.get('securityQuestion') || ''),
    securityAnswer: normalizeAnswer(form.get('securityAnswer')),
    student: studentData,
    studentId,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  // Claim the name first, so a failed save never leaves a dangling claim.
  if (!reserveUsername(username, studentId)) return setAuthMessage('এই ইউজারনেমটি এরই মধ্যে অন্য কেউ নিয়েছে। অন্য একটি বেছে নিন।');
  // The account is written with a PBKDF2-hashed password; the plaintext PIN
  // stays in this form submission only.
  if (!(await saveAccount(account))) {
    releaseUsername(username, studentId);
    return setAuthMessage('সংরক্ষণ হয়নি। স্টোরেজ পরীক্ষা করে আবার চেষ্টা করুন।');
  }
  state.account = loadAccount() || account;
  state.student = { ...state.student, ...studentData };
  saveStudent(state.student);
  upsertStudentRosterRow();   // the exact personal fields, nothing the branch owns
  formElement.reset();
  toggleMajorField();
  $('#pendingStudentId').textContent = studentId;
  switchAuthTab('login');
  $('#loginMobile').value = username;
  $('#loginPin').value = '';
  setAuthMessage(`রেজিস্ট্রেশন সফল। Student ID: ${studentId} • লগইনে “${username}” ও আপনার পাসওয়ার্ড দিন।`, true);
  onRegistered?.();
  showFeedback(`রেজিস্ট্রেশন সফল — ID: ${studentId} • ইউজারনেম: ${username}`);
}

function initRegistrationSteps() {
  const steps = $$('[data-registration-step]');
  if (!steps.length) return { reset: () => {} };
  let current = 0;
  const progressBar = $('#registrationProgressBar');
  const count = $('#registrationStepCount');
  const title = $('#registrationStepTitle');

  const showStep = index => {
    current = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, stepIndex) => {
      const active = stepIndex === current;
      step.hidden = !active;
      step.classList.toggle('active', active);
      step.setAttribute('aria-hidden', String(!active));
    });
    if (progressBar) progressBar.style.width = `${((current + 1) / steps.length) * 100}%`;
    if (count) count.textContent = `ধাপ ${current + 1} / ${steps.length}`;
    if (title) title.textContent = steps[current].dataset.stepTitle;
  };

  const validateCurrentStep = () => {
    const fields = $$('input, select, textarea', steps[current]);
    const invalid = fields.find(field => !field.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return false;
    }
    return true;
  };

  steps.forEach((step, index) => {
    $('[data-next-step]', step)?.addEventListener('click', () => {
      if (validateCurrentStep()) showStep(index + 1);
    });
    $('[data-previous-step]', step)?.addEventListener('click', () => showStep(index - 1));
  });
  showStep(0);
  return { reset: () => showStep(0) };
}

export function initRegister({ state, onRegistered }) {
  populateRegistrationClasses();
  initFixedContactMobile();
  initUsernameField();
  const registerSteps = initRegistrationSteps();
  $('#regClass')?.addEventListener('change', toggleMajorField);
  $('#registrationForm')?.addEventListener('submit', event => handleRegistration(event, state, onRegistered));

  // Starting registration always returns to the first step.
  $$('[data-auth-tab]').forEach(trigger => trigger.addEventListener('click', () => {
    if (trigger.dataset.authTab === 'register') registerSteps.reset();
  }));
}
