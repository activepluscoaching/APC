/** Cross-role presentation accessibility. Never changes business/data state. */
const focusable = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
const visible = el => !el.closest('[hidden]') && el.getClientRects().length > 0;
const previousFocus = new WeakMap();
const dialogSelector = '.admin-modal,.modal,.staff-pw-card,.apc-lock-card';
let activeDialog = null;
function enhance() {
  // Retain column names when the mobile layout presents rows as compact cards.
  document.querySelectorAll('table').forEach(table => {
    const headers = [...table.querySelectorAll('thead tr:last-child th')].map(th => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach(row => {
      [...row.children].forEach((cell, index) => {
        if (headers[index] && cell.colSpan === 1 && !cell.hasAttribute('data-label')) cell.dataset.label = headers[index];
      });
    });
  });
  const dialogs = [...document.querySelectorAll(dialogSelector)].filter(visible);
  const next = dialogs.at(-1) || null;
  if (next === activeDialog) return;
  if (activeDialog) {
    const opener = previousFocus.get(activeDialog);
    if (!next && opener?.isConnected && visible(opener)) opener.focus();
  }
  activeDialog = next;
  if (!next) return;
  // Some feature forms synchronously focus their first field before the
  // observer sees the open dialog. Keep the external opener captured below,
  // rather than recording that field as its own return target.
  if (!next.contains(document.activeElement)) previousFocus.set(next, document.activeElement);
  next.setAttribute('role', 'dialog');
  next.setAttribute('aria-modal', 'true');
  if (!next.hasAttribute('aria-label') && !next.hasAttribute('aria-labelledby')) {
    const title = next.querySelector('h1,h2,h3');
    next.setAttribute('aria-label', title?.textContent.trim() || 'ডায়ালগ');
  }
  if (!next.contains(document.activeElement)) {
    const target = [...next.querySelectorAll(focusable)].find(visible);
    if (target) target.focus();
    else { next.tabIndex = -1; next.focus(); }
  }
}
function start() {
  document.addEventListener('focusin', event => {
    const dialog = event.target.closest?.(dialogSelector);
    const opener = event.relatedTarget;
    if (dialog && dialog !== activeDialog && opener && !dialog.contains(opener)) previousFocus.set(dialog, opener);
  });
  enhance();
  new MutationObserver(enhance).observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['hidden','class']});
  document.addEventListener('keydown', event => {
    if (!activeDialog || !visible(activeDialog)) return;
    if (event.key === 'Escape') {
      const close = activeDialog.querySelector('.modal-close,.admin-modal-close,[data-staff-pw-cancel]');
      if (close && visible(close)) { event.preventDefault(); close.click(); }
    }
    if (event.key !== 'Tab') return;
    const controls = [...activeDialog.querySelectorAll(focusable)].filter(visible);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); activeDialog.focus(); }
    else if (event.shiftKey && (document.activeElement === first || !activeDialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !activeDialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
else start();
