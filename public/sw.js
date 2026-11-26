const CACHE_NAME = 'mahasangh-pwa-cache-v30';
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
      return cache.addAll(STATIC_ASSETS);
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

  // Skip cross-origin API calls or non-GET requests from aggressive static cache
  if (event.request.method !== 'GET') {
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
          // Fallback if offline and image not cached
          return new Response('', { status: 404, statusText: 'Offline Image' });
        });
      })
    );
    return;
  }

  // For navigation and App shell: Stale-while-revalidate / Network first with offline fallback
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
        // Return cached response if offline
        return cachedResponse || caches.match('/');
      });

      return cachedResponse || fetchPromise;
    })
  );
});
