/* Immediate Service Worker cache busting for browsers trapped on an older
   cache-first APP_SHELL release. Because this script path did not exist in
   older Service Worker caches (<= v398), an older active Service Worker must
   fetch it from the network on navigation. */
(function refreshStaleAppShellCache() {
  const TARGET_VERSION = 402;
  const TARGET_CACHE = `active-plus-student-v${TARGET_VERSION}-minimal-education`;
  const RELOAD_FLAG = `apc_sw_refreshed_v${TARGET_VERSION}`;
  if (typeof window === 'undefined' || !('caches' in window)) return;
  void (async () => {
    try {
      const keys = await window.caches.keys();
      const stale = keys.filter(key => key.startsWith('active-plus-student-v') && key !== TARGET_CACHE);
      if (!stale.length) return;
      await Promise.all(stale.map(key => window.caches.delete(key)));
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.register(`./sw.js?v=${TARGET_VERSION}`);
        await reg.update();
      }
      if (window.sessionStorage.getItem(RELOAD_FLAG) !== '1') {
        window.sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
      }
    } catch {
      /* Ignore offline/storage restriction errors */
    }
  })();
})();
