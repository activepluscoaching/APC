/* Output escaping and input hygiene helpers.
   Every piece of user- or admin-provided text that reaches innerHTML must go
   through escapeHtml first; textContent needs no escaping. Keeping these in
   one module means admin.js, payment.js, teacher.js and the exam tools all
   escape identically, and new code cannot quietly invent its own rules. */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML-escape text for safe interpolation into innerHTML. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch]);
}

/** Escape text for use inside a single- or double-quoted attribute value. */
export const escapeAttr = escapeHtml;

/** Only http(s) and relative URLs survive; javascript: and data: do not. */
export function safeUrl(value) {
  const url = String(value ?? '').trim();
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url)) return /^https?:\/\//i.test(url) ? url : '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return ''; // any other scheme: javascript:, data:, …
  return url;
}

/** Strip control characters and collapse whitespace in stored free text. */
export function cleanText(value, { max = 2000 } = {}) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
