/* Firebase Cloud Messaging service worker
   Loaded automatically by FCM at /firebase-messaging-sw.js
   Handles background push notifications. */

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

const search = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: search.get('apiKey') || '',
  authDomain: search.get('authDomain') || '',
  projectId: search.get('projectId') || '',
  storageBucket: search.get('storageBucket') || '',
  messagingSenderId: search.get('messagingSenderId') || '',
  appId: search.get('appId') || '',
};

if (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId) {
  firebase.initializeApp(firebaseConfig);

  const messaging = firebase.messaging();

  // Background notification handler — fires when app is closed/backgrounded.
  // We explicitly guard against showing a duplicate when the app tab is already
  // visible: in that case the page-level `onMessage` handler (AuthContext) will
  // create the notification, so the service worker should stay silent.
  messaging.onBackgroundMessage((payload) => {
    // eslint-disable-next-line no-console
    console.log('[firebase-messaging-sw.js] Background message:', payload);

    return clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // If any app window is currently visible, the foreground handler handles it.
        const isAppInForeground = windowClients.some(
          (client) => client.visibilityState === 'visible',
        );
        if (isAppInForeground) return;

        const notificationTitle = payload.notification?.title || payload.data?.title || 'Sreerasthu Silvers';
        const notificationOptions = {
          body: payload.notification?.body || payload.data?.body || '',
          icon: payload.notification?.icon || '/icon-192.png',
          badge: '/icon-192.png',
          image: payload.notification?.image || payload.data?.image,
          tag: payload.data?.tag || 'srs-notification',
          data: {
            url: payload.data?.url || payload.fcmOptions?.link || '/',
            ...payload.data,
          },
          requireInteraction: payload.data?.requireInteraction === 'true',
        };

        return self.registration.showNotification(notificationTitle, notificationOptions);
      });
  });
} else {
  console.warn('[firebase-messaging-sw.js] Missing Firebase config in service worker URL');
}

// Click handler — focus existing tab or open new one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
