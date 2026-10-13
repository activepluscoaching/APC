/* Offline registration. The worker activates immediately, so notify on
 * controllerchange as well as updatefound (there may be no waiting worker). */
import { requestPersistentStorage } from './storage-safety.js';
export function registerServiceWorker() {
  void requestPersistentStorage();
  if (!('serviceWorker' in navigator)) return;
  let hadController = Boolean(navigator.serviceWorker.controller);
  const showUpdate = () => {
    if (!hadController || document.getElementById('apcUpdateBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'apcUpdateBanner'; banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:fixed;z-index:99998;top:0;left:0;right:0;padding:12px 18px;background:#073b2c;color:white;display:flex;align-items:center;justify-content:space-between;gap:12px';
    const label = document.createElement('span'); label.textContent = 'নতুন সংস্করণ আছে';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'রিফ্রেশ করুন';
    button.style.cssText = 'min-width:48px;min-height:48px;padding:10px 18px;color:#073b2c;background:#fff;border:0;border-radius:8px;cursor:pointer';
    button.addEventListener('click', () => location.reload());
    banner.append(label, button); document.body?.append(banner);
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    showUpdate(); hadController = true;
  });
  const register = () => navigator.serviceWorker.register('./sw.js').then(registration => {
    if (registration.waiting) showUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') showUpdate();
      });
    });
  }).catch(() => { /* App remains usable without service worker. */ });
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
