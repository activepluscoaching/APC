/* Logout feature: confirmation modal and session clearing. */
import { $, openModal, closeModal } from './ui.js';
import { clearSession } from './storage.js';

export function requestLogout() {
  openModal('logoutModal');
}

export function initLogout({ onLoggedOut }) {
  $('#logoutConfirmButton')?.addEventListener('click', () => {
    closeModal('logoutModal');
    clearSession();
    onLoggedOut?.();
  });
}
