const CACHE_NAME = 'uniportal-v1.0.2';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './icon-192.png'
];

// Install event - cache resources
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('[ServiceWorker] Cache failed:', error);
      })
  );
  self.skipWaiting(); // Force activation
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(response => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          
          return response;
        });
      })
      .catch(error => {
        console.error('[ServiceWorker] Fetch failed:', error);
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Take control immediately
});
// Message event - Receive requests from main script.js for scheduled notifications
self.addEventListener('message', event => {
  console.log('[ServiceWorker] Received message from main thread:', event.data.action);
  
  // Check if the message is a notification request
  if (event.data && event.data.action === 'notify') {
    const { title, body, icon } = event.data;
    
    // Use self.registration.showNotification to display the notification
    event.waitUntil(
      self.registration.showNotification(title, {
        body: body,
        icon: icon || './icon-192.png', // Use provided icon or default
        badge: './icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'uniportal-scheduled-' + Date.now(),
        requireInteraction: true // Set to true if you want it to stay open
      })
      .then(() => {
        console.log('[ServiceWorker] Displayed scheduled notification:', title);
      })
      .catch(error => {
        console.error('[ServiceWorker] Failed to display notification:', error);
      })
    );
  }
});


// Push notification event
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'UniPortal';
  const options = {
    body: data.body || 'You have a new notification',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});


