/* Navigation and feature action routing. */
import { $$, closeModal } from './ui.js';
import { setView } from './shell.js';

export function initNavigation({ onAction }) {
  document.addEventListener('click', event => {
    const viewTrigger = event.target.closest('[data-view]');
    if (viewTrigger) {
      event.preventDefault();
      // Tab/shortcut clicks walk the history stack so browser and system Back
      // return to the previous view (pattern: deep-linkable routes).
      setView(viewTrigger.dataset.view, { history: 'push' });
      return;
    }

    const actionTrigger = event.target.closest('[data-action]');
    if (actionTrigger) {
      event.preventDefault();
      onAction?.(actionTrigger.dataset.action);
    }

    const closeTrigger = event.target.closest('[data-close-modal]');
    if (closeTrigger) closeModal(closeTrigger.dataset.closeModal);
  });

  $$('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) closeModal(backdrop.id);
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      $$('.modal-backdrop:not([hidden])').forEach(modal => closeModal(modal.id));
    }
  });
}
