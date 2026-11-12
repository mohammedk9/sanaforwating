/* SANA — Service Worker: Offline shell (network-first للصفحة) + Web Push */
const CACHE = 'sana-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/sana-logo.svg',
  './assets/sana-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/rest/') || url.pathname.includes('/auth/') || url.pathname.includes('/functions/')) return;

  const isDocument = request.mode === 'navigate' || request.destination === 'document';

  // الصفحة الرئيسية: الشبكة أولا حتى تصل التحديثات ثم الكاش عند انقطاع الشبكة
  if (isDocument) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true })
          .then((hit) => hit || caches.match('./', { ignoreSearch: true })))
    );
    return;
  }

  // الأصول (js/css/صور): الكاش أولا مع تحديث في الخلفية
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'SANA', body: event.data ? event.data.text() : 'طلبك جاهز!' };
  }

  const title = data.title ?? 'SANA';
  const options = {
    body: data.body ?? 'طلبك جاهز! 🎉',
    icon: data.icon ?? './assets/sana-logo.svg',
    badge: './assets/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    tag: data.tag ?? data.orderNumber ?? 'sana-order-ready',
    data: { url: data.url ?? './', orderNumber: data.orderNumber },
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
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
