/* SANA — Service Worker لإشعارات Web Push */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
  console.log('[SANA SW] installed');
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  console.log('[SANA SW] activated, clients claimed');
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'SANA', body: event.data?.text?.() ?? 'طلبك جاهز!' };
  }

  const title = data.title ?? 'SANA';
  const options = {
    body: data.body ?? 'طلبك جاهز! 🎉',
    icon: data.icon ?? './assets/sana-logo.svg',
    badge: './assets/sana-logo.svg',
    dir: 'rtl',
    lang: 'ar',
    tag: data.tag ?? data.orderNumber ?? 'sana-order-ready',
    data: { url: data.url ?? './', orderNumber: data.orderNumber, title, body: data.body },
    requireInteraction: false,
    vibrate: [200, 100, 200],
    actions: [{ action: 'open', title: 'فتح الطلب' }],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeControlledClients: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('notificationclose', () => {
  // المستخدم أغلق الإشعار يدوياً
});
