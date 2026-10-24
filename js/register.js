import { backendMode } from '../sync/cloud-access.js';
/* Registration UI & early step validation. Submit-time atomic persistence lives in
   ./registration-service.js so the parser-blocking first-paint graph stays compact. */
import { $, $$, setAuthMessage } from './ui.js';
import { enabledClasses } from './config.js';
import { registrationPasswordError } from './password-policy.js';
import {
  contactNumber,
  isContactNumber,
  mobileError,
  normalizeUsername,
  usernameError,
  suggestUsername,
  normalizeEmail,
  emailError
} from './account-policy.js';
import { usernameTaken, mobileTaken, emailTaken } from './storage.js';

export const DUPLICATE_MOBILE_MESSAGE = 'এই মোবাইল নম্বর দিয়ে আগেই রেজিস্ট্রেশন হয়েছে।';
export const DUPLICATE_USERNAME_MESSAGE = 'এই ইউজারনেমটি আগেই নেওয়া হয়েছে। অন্য একটি বেছে নিন — এটি পরে বদলানো যাবে না।';
export const DUPLICATE_EMAIL_MESSAGE = 'এই ইমেইল ঠিকানা দিয়ে আগেই রেজিস্ট্রেশন হয়েছে।';

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
  const sync = () => {
    contactMobile.value = loginMobile.value;
    loginMobile.setCustomValidity('');
  };
  loginMobile.addEventListener('input', sync);
  loginMobile.addEventListener('blur', () => {
    const normalized = contactNumber(loginMobile.value);
    if (isContactNumber(normalized)) {
      loginMobile.value = normalized;
      contactMobile.value = normalized;
    }
  });
  sync();
}

function initUsernameField() {
  const field = $('#regUsername');
  if (!field) return;
  const status = $('#regUsernameStatus');
  const setStatus = (message, ok) => {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-ok', Boolean(ok));
    status.classList.toggle('is-bad', !ok && Boolean(message));
  };
  const check = () => {
    const typed = normalizeUsername(field.value);
    field.setCustomValidity('');
    if (!typed) { setStatus('', false); return true; }
    const problem = usernameError(typed);
    if (problem) { setStatus(problem, false); return false; }
    if (usernameTaken(typed)) { setStatus(DUPLICATE_USERNAME_MESSAGE, false); return false; }
    setStatus('✓ এই ইউজারনেমটি নেওয়া যাবে', true);
    return true;
  };
  field.addEventListener('input', check);
  field.addEventListener('blur', () => {
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

function initEmailField() {
  const field = $('#regEmail');
  if (!field) return;
  const status = $('#regEmailStatus');
  const setStatus = (message, ok) => {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-ok', Boolean(ok));
    status.classList.toggle('is-bad', !ok && Boolean(message));
  };
  const check = () => {
    const normalized = normalizeEmail(field.value);
    field.setCustomValidity('');
    if (!normalized) { setStatus('', false); return true; }
    const err = emailError(normalized);
    if (err) { setStatus(err, false); return false; }
    if (emailTaken(normalized)) { setStatus(DUPLICATE_EMAIL_MESSAGE, false); return false; }
    setStatus('✓ ইমেইল ঠিকানা সঠিক আছে', true);
    return true;
  };
  field.addEventListener('input', check);
  field.addEventListener('blur', () => {
    const normalized = normalizeEmail(field.value);
    if (normalized) field.value = normalized;
    check();
  });
  return check;
}

async function handleRegistration(event, state, onRegistered) {
  event.preventDefault();
  if (backendMode() === 'firebase') {
    setAuthMessage('Firebase নিবন্ধন বন্ধ। লোকাল মোড: ?backend=local');
    return;
  }
  const formElement = event.currentTarget;
  if (!formElement.checkValidity()) {
    formElement.reportValidity();
    return;
  }
  const entries = [...new FormData(formElement).entries()];
  const svc = await import('./registration-service.js');
  return svc.submitStudentRegistration({ entries, formElement, state, onRegistered, toggleMajorField });
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
    const stepEl = steps[current];
    const fields = $$('input, select, textarea', stepEl);
    const invalid = fields.find(field => !field.checkValidity());
    if (invalid) { invalid.reportValidity(); return false; }
    if (current === 0) {
      const mobileInput = $('#regMobile', stepEl);
      const userInput = $('#regUsername', stepEl);
      const mobile = contactNumber(mobileInput?.value || '');
      const mobErr = mobileError(mobile);
      if (mobErr) { setAuthMessage(mobErr); mobileInput?.focus(); return false; }
      if (mobileTaken(mobile)) { setAuthMessage(DUPLICATE_MOBILE_MESSAGE); mobileInput?.focus(); return false; }
      if (mobileInput) mobileInput.value = mobile;
      if ($('#studentMobile')) $('#studentMobile').value = mobile;

      const uname = normalizeUsername(userInput?.value || '');
      const unameErr = usernameError(uname);
      if (unameErr) { setAuthMessage(unameErr); userInput?.focus(); return false; }
      if (usernameTaken(uname)) { setAuthMessage(DUPLICATE_USERNAME_MESSAGE); userInput?.focus(); return false; }
      if (userInput) userInput.value = uname;

      const pin = $('#regPin', stepEl)?.value || '';
      const pinConfirm = $('#regPinConfirm', stepEl)?.value || '';
      const pinErr = registrationPasswordError(pin, pinConfirm);
      if (pinErr) { setAuthMessage(pinErr); $('#regPin', stepEl)?.focus(); return false; }
      setAuthMessage('');
    }
    if (current === 2) {
      const guardianInput = $('#guardianMobile', stepEl);
      const emailInput = $('#regEmail', stepEl);
      const guardian = contactNumber(guardianInput?.value || '');
      if (!isContactNumber(guardian)) {
        setAuthMessage('অভিভাবকের সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন।');
        guardianInput?.focus();
        return false;
      }
      if (guardianInput) guardianInput.value = guardian;
      const email = normalizeEmail(emailInput?.value || '');
      const mailErr = emailError(email);
      if (mailErr) { setAuthMessage(mailErr); emailInput?.focus(); return false; }
      if (email && emailTaken(email)) { setAuthMessage(DUPLICATE_EMAIL_MESSAGE); emailInput?.focus(); return false; }
      if (emailInput && email) emailInput.value = email;
      setAuthMessage('');
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

function maybeFlushQueuedRegistrations() {
  try {
    if (!navigator.onLine) return;
    const raw = window.localStorage?.getItem('activePlus.pendingCloudRegistrations.v1');
    if (!raw || raw === '[]') return;
    import('./registration-service.js')
      .then(mod => mod.flushPendingLocalRegistrations())
      .catch(() => {});
  } catch { /* ignore storage access issues */ }
}

export function initRegister({ state, onRegistered }) {
  populateRegistrationClasses();
  initFixedContactMobile();
  initUsernameField();
  initEmailField();
  const registerSteps = initRegistrationSteps();
  $('#regClass')?.addEventListener('change', toggleMajorField);
  $('#registrationForm')?.addEventListener('submit', event => handleRegistration(event, state, onRegistered));
  $$('[data-auth-tab]').forEach(trigger => trigger.addEventListener('click', () => {
    if (trigger.dataset.authTab === 'register') registerSteps.reset();
  }));
  window.addEventListener('online', maybeFlushQueuedRegistrations);
  maybeFlushQueuedRegistrations();
}
