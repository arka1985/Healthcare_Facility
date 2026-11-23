const CACHE_NAME = 'aarogyamap-cache-v5';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass through external map tiles, routing and API calls with network
  if (event.request.url.includes('tile.openstreetmap') || 
      event.request.url.includes('arcgisonline.com') ||
      event.request.url.includes('api.data.gov.in') ||
      event.request.url.includes('router.project-osrm.org')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});