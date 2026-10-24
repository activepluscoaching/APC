/* Shared counter privacy primitives. No DOM, storage or contact fetching. */
import { latinDigits } from './student-search.js';

export function counterPhone(value) {
  let digits = latinDigits(value).replace(/[\s()+.-]/g, '');
  if (digits.startsWith('880')) digits = '0' + digits.slice(3);
  return /^01[3-9]\d{8}$/.test(digits) ? digits : '';
}
export function maskCounterPhone(value) {
  const digits = counterPhone(value);
  return digits ? digits.slice(0,4) + '***' + digits.slice(7) : '—';
}
export function counterContacts(student) {
  return {
    mobileMasked: maskCounterPhone(student?.studentMobile || student?.mobile || student?.registrationMobile),
    guardianMobileMasked: maskCounterPhone(student?.guardianMobile)
  };
}
