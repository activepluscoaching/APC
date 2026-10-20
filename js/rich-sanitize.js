import { escapeHtml } from './sanitize.js';

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
