/* Password policy for registration and the Admin/Manager reset dialogs.
   There is no default password anywhere in the app: an empty field is an
   error at registration, and the reset dialogs GENERATE a fresh random
   6-digit password when submitted empty (shown once, never stored in
   plaintext). Pure helpers — no storage access — so tests pin the contract. */

export const EMPTY_PASSWORD_ERROR = 'পাসওয়ার্ড দিন।';
export const PASSWORD_SHAPE_ERROR = 'পাসওয়ার্ড অবশ্যই ৪ থেকে ৬ সংখ্যার হতে হবে।';
export const PASSWORD_MISMATCH_ERROR = 'দুটি পাসওয়ার্ড এক নয়। আবার মিলিয়ে দিন।';

const NUMERIC_PIN = /^\d{4,6}$/;

/** Registration gate: returns the Bengali error message, or '' when the
   password is usable. An empty password is rejected explicitly — it never
   falls through to any built-in default. */
export function registrationPasswordError(pin, confirmation) {
  const value = String(pin ?? '');
  const confirm = String(confirmation ?? '');
  if (!value.trim()) return EMPTY_PASSWORD_ERROR;
  if (!NUMERIC_PIN.test(value)) return PASSWORD_SHAPE_ERROR;
  if (value !== confirm) return PASSWORD_MISMATCH_ERROR;
  return '';
}

/** A random numeric password (default 6 digits) for one-time display. */
export function randomNumericPassword(digits = 6) {
  const length = Math.max(1, Math.min(12, Number(digits) || 6));
  const min = 10 ** (length - 1);
  const span = 9 * min;
  const webcrypto = globalThis.crypto;
  let draw;
  if (webcrypto && typeof webcrypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    webcrypto.getRandomValues(buf);
    draw = buf[0] / 2 ** 32;
  } else {
    draw = Math.random();
  }
  return String(min + Math.floor(draw * span));
}

/** What a reset dialog applies when confirmed: the typed password, or a fresh
   random 6-digit one when the field was left empty (generated → show once). */
export function resolveResetPassword(input) {
  const typed = String(input ?? '').trim();
  if (!typed) return { password: randomNumericPassword(6), generated: true, error: '' };
  if (!NUMERIC_PIN.test(typed)) return { password: '', generated: false, error: PASSWORD_SHAPE_ERROR };
  return { password: typed, generated: false, error: '' };
}
