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


/** Keep a small, semantic formatting subset for lesson sheets pasted from
 * Word/Google Docs. No scripts, styles, event handlers, embeds or unsafe URLs. */
export function sanitizeRichHtml(value, { max = 8000 } = {}) {
  const source = String(value ?? '').slice(0, max * 4);
  if (typeof DOMParser === 'undefined') return escapeHtml(source).replace(/\n/g, '<br>');
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const allowed = new Set(['P','BR','DIV','H1','H2','H3','STRONG','B','EM','I','UL','OL','LI','BLOCKQUOTE','PRE','CODE','TABLE','THEAD','TBODY','TR','TH','TD','HR','A']);
  const visit = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1) {
        if (!allowed.has(child.tagName)) {
          if (['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','INPUT','VIDEO','AUDIO'].includes(child.tagName)) {
            child.remove();
            continue;
          }
          visit(child);
          child.replaceWith(...child.childNodes);
          continue;
        }
        const rawHref = child.tagName === 'A' ? (child.getAttribute('href') || '') : '';
        for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
        if (child.tagName === 'A') {
          const raw = rawHref;
          if (/^https?:\/\//i.test(raw)) {
            child.setAttribute('href', raw);
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          } else child.removeAttribute('href');
        }
        visit(child);
      } else if (child.nodeType !== 3) child.remove();
    }
  };
  visit(doc.body);
  return doc.body.innerHTML.slice(0, max);
}
