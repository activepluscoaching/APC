/* FCM background service worker — the only file that can show a notification
   while the app is fully closed. It must stay at the repository root so its
   scope covers the whole app.

   The sender (functions/index.js → pushNotice / pushBroadcast / pushExam) sends
   a message with both a `notification` block and a `data` block. When the
   notification block is present the Firebase SDK displays it itself; this file
   only displays the data-only message so a payload can never appear twice. */

// The local classic bundle also selects the matching dev/prod PUBLIC web config.
importScripts('./vendor/firebase/messaging-compat.js');
firebase.initializeApp(self.apcMessagingFirebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const notification = payload?.notification;
  if (notification && (notification.title || notification.body)) return;   // shown by the SDK
  const data = payload?.data || {};
  return self.registration.showNotification(data.title || 'Active Plus', {
    body: data.body || '',
    icon: './assets/icons/icon-192.png',
    tag: data.key || payload?.messageId || 'active-plus',
    data
  });
});

/* One tap brings the app to the front instead of stacking new tabs. With no
   window open it opens the device's own panel (the hint js/panel-lockdown.js
   left behind) or the app door — a pushed payload can never point a device at
   another panel, so its `url` field is deliberately ignored here. */
const PANEL_HINT_CACHE = 'apc-panel-hint';
const PANEL_HINT_PATH = './__apc-last-panel';
const PANEL_PAGES = ['admin.html', 'manager.html', 'teacher.html', 'payment.html'];
const APP_ENTRY = './index.html';

async function panelHintTarget() {
  try {
    const cache = await caches.open(PANEL_HINT_CACHE);
    const response = await cache.match(PANEL_HINT_PATH);
    if (!response) return '';
    const file = (await response.text()).trim().toLowerCase();
    return PANEL_PAGES.includes(file) ? `./${file}` : '';
  } catch { return ''; }
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if ('focus' in client) {
        client.postMessage({ type: 'apc-notification-click', data: event.notification?.data || {} });
        return client.focus();
      }
    }
    const target = (await panelHintTarget()) || APP_ENTRY;
    return self.clients.openWindow(target);
  })());
});
