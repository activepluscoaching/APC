/* Offline app shell registration, including modules resumed after async setup. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const register = () => navigator.serviceWorker.register('./sw.js').catch(() => {
    // The UI remains usable if opened without a service worker.
  });
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
