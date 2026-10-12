/* PWA installation prompt. This module is the only place that knows browser install APIs. */
import { $, showFeedback } from './ui.js';
import { STORAGE_KEYS } from './config.js';

let deferredPrompt = null;

export async function installApp() {
  if (!deferredPrompt) {
    showFeedback('Chrome মেনু থেকে “অ্যাপ ইনস্টল করুন” বেছে নিন');
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  if ($('#installToast')) $('#installToast').hidden = true;
}

export function initInstallPrompt() {

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    if (!localStorage.getItem(STORAGE_KEYS.installDismissed)) {
      window.setTimeout(() => { if ($('#installToast')) $('#installToast').hidden = false; }, 1200);
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if ($('#installToast')) $('#installToast').hidden = true;
    showFeedback('অ্যাপটি সফলভাবে ইনস্টল হয়েছে');
  });

  $('#installButton')?.addEventListener('click', installApp);

  $('#dismissInstall')?.addEventListener('click', () => {
    $('#installToast').hidden = true;
    try { localStorage.setItem(STORAGE_KEYS.installDismissed, '1'); } catch { /* no-op */ }
  });
}
