/* SANA — Service Worker: Offline shell + Web Push «جاهزية الطلب» */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('sana-v1').then((cache) =>
      cache.addAll(['./', './index.html', './manifest.webmanifest', './assets/icon-192.png', './assets/icon-512.png', './assets/sana-logo.svg', './assets/sana-logo.png'])
    ).then(() => self.skipWaiting())
  );
  console.log('[SANA SW] installed');
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== 'sana-v1').map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
  console.log('[SANA SW] activated, clients claimed');
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // لا نكاش طلبات Supabase/Auth (فقط app shell + صور)
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/rest/') || url.pathname.includes('/auth/') || url.pathname.includes('/functions/')) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok && (url.pathname.endsWith('.png') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
          const copy = res.clone();
          caches.open('sana-v1').then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html', { ignoreSearch: true }));
    })
  );
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
    badge: './assets/icon-192.png',
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
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('notificationclose', () => {
  // المستخدم أغلق الإشعار يدوياً
});

