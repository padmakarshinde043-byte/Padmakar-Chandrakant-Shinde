const CACHE_NAME = 'mahasangh-pwa-cache-v31';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/logo.png',
  '/logo-opt.webp',
  '/president.jpg',
  '/president.webp',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(STATIC_ASSETS.map((asset) => cache.add(asset)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept non-GET requests or backend API routes
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // Never cache manifest requests
  if (url.pathname.includes('manifest')) {
    return;
  }

  // For images and fonts: Cache First with 30-day fallback
  if (
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico|woff|woff2|ttf)$/i) ||
    url.origin.includes('cloudinary.com') ||
    url.origin.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => {
          return new Response('', { status: 404, statusText: 'Offline Image' });
        });
      })
    );
    return;
  }

  // For navigation and App shell: Stale-while-revalidate with offline fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        return cachedResponse || caches.match('/');
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// =========================================================================
// Web Push Notifications (Works on Web Browsers & Play Store TWA App)
// =========================================================================
self.addEventListener('push', (event) => {
  let data = {
    title: 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    body: 'महासंघाची नवीन महत्त्वाची सूचना प्रसिद्ध झाली आहे.',
    url: '/',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        data = {
          title: String(parsed.title || data.title),
          body: String(parsed.body || data.body),
          url: typeof parsed.url === 'string' && parsed.url.startsWith('/') ? parsed.url : '/',
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
        };
      }
    } catch {
      const txt = event.data.text();
      if (txt) data.body = txt;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    vibrate: [200, 100, 200],
    tag: 'mahasangh-push-alert',
    renotify: true,
    data: {
      url: data.url,
    },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification?.data?.url;
  const safePath =
    typeof rawUrl === 'string' && rawUrl.startsWith('/') && !rawUrl.startsWith('//')
      ? rawUrl
      : '/';
  const targetUrl = new URL(safePath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
