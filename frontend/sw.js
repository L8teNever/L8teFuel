const CACHE_NAME = 'l8tefuel-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Install Event
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS);
        })
    );
});

// Activate Event
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys
                .filter(key => key !== CACHE_NAME)
                .map(key => caches.delete(key))
            );
        })
    );
});

// Fetch Event (Network First for API, Cache First for Assets)
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    if (url.pathname.startsWith('/token') || url.pathname.startsWith('/me') || url.pathname.startsWith('/check-prices')) {
        event.respondWith(fetch(event.request));
    } else {
        event.respondWith(
            caches.match(event.request).then(response => {
                return response || fetch(event.request);
            })
        );
    }
});

// Background Sync (Experimental/Limited support)
self.addEventListener('sync', event => {
    if (event.tag === 'check-prices') {
        event.waitUntil(doBackgroundCheck());
    }
});

async function doBackgroundCheck() {
    // In a real PWA, you might try to fetch notifications or status from backend
    // Background execution is very limited in browers.
    console.log('Background Sync triggered');
}

// Push Notifications
self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'L8teFuel Alert';
    const options = {
        body: data.body || 'Günstige Tankstelle gefunden!',
        icon: '/icons/icon-512.png',
        badge: '/icons/icon-192.png',
        data: { url: data.url }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url || '/')
    );
});
