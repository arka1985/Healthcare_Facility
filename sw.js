const CACHE_NAME = 'aarogyamap-cache-v13';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css?v=13',
  './app.js?v=13',
  './data/hospitals_failsafe.js',
  './INDIA/india_data.js',
  './manifest.json',
  './favicon.png',
  './assets/cliparts/logo.svg',
  './assets/cliparts/watercolor_bg.svg',
  './assets/icons/hospital.svg',
  './assets/icons/clinic.svg',
  './assets/icons/emergency.svg',
  './assets/icons/ambulance.svg',
  './assets/icons/bloodbank.svg',
  './assets/icons/ayush.svg',
  './assets/icons/user_location.svg',
  './assets/icons/pin_destination.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
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
  const url = event.request.url;

  // 1. Pass through external map tiles, routing and API calls directly to network
  if (url.includes('tile.openstreetmap') || 
      url.includes('arcgisonline.com') ||
      url.includes('api.data.gov.in') ||
      url.includes('router.project-osrm.org')) {
    return;
  }

  // 2. NETWORK-FIRST for HTML, App JS, CSS, and Data Files:
  // Guarantees mobile devices always fetch the fresh clean version from server when online
  if (event.request.mode === 'navigate' || 
      url.endsWith('.html') || 
      url.includes('.js') || 
      url.includes('.css') || 
      url.includes('data/') || 
      url.includes('.json')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            if (event.request.destination === 'document') {
              return caches.match('./index.html');
            }
          });
        })
    );
    return;
  }

  // 3. Cache-First for static assets (images, icons)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request);
    })
  );
});