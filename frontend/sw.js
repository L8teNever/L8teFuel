const CACHE_NAME = 'l8tefuel-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Install Event - Cache assets
self.addEventListener('install', event => {
    console.log('[SW] Installing Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Caching app shell');
            return cache.addAll(ASSETS);
        }).then(() => {
            return self.skipWaiting();
        })
    );
});

// Activate Event - Clean old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating Service Worker...');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log('[SW] Deleting old cache:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

// Fetch Event - Network First for API, Cache First for Assets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Network-first for API endpoints
    if (url.pathname.startsWith('/token') ||
        url.pathname.startsWith('/me') ||
        url.pathname.startsWith('/check-prices') ||
        url.pathname.startsWith('/search-stations') ||
        url.pathname.startsWith('/admin')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(JSON.stringify({ error: 'Offline' }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
    } else {
        // Cache-first for static assets
        event.respondWith(
            caches.match(event.request).then(response => {
                return response || fetch(event.request).then(fetchResponse => {
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, fetchResponse.clone());
                        return fetchResponse;
                    });
                });
            }).catch(() => {
                // Fallback for offline
                if (event.request.destination === 'document') {
                    return caches.match('/index.html');
                }
            })
        );
    }
});

// Push Notifications - Triggered when cheap station found
self.addEventListener('push', event => {
    console.log('[SW] Push notification received');

    const data = event.data ? event.data.json() : {};
    const title = data.title || '⛽ L8teFuel Alert';

    const options = {
        body: data.body || 'Günstige Tankstelle in deiner Nähe gefunden!',
        icon: '/icons/icon-512.png',
        badge: '/icons/icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'fuel-alert',
        requireInteraction: true,
        data: {
            url: data.url || '/',
            station: data.station || null
        },
        actions: [
            {
                action: 'view',
                title: 'Anzeigen',
                icon: '/icons/icon-192.png'
            },
            {
                action: 'dismiss',
                title: 'Schließen'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Notification Click Handler
self.addEventListener('notificationclick', event => {
    console.log('[SW] Notification clicked:', event.action);

    event.notification.close();

    if (event.action === 'dismiss') {
        return;
    }

    // Open or focus the app
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            // Check if app is already open
            for (let client of clientList) {
                if (client.url === event.notification.data.url && 'focus' in client) {
                    return client.focus();
                }
            }
            // Open new window if not
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url || '/');
            }
        })
    );
});

// Background Sync (for future use)
self.addEventListener('sync', event => {
    console.log('[SW] Background sync triggered:', event.tag);

    if (event.tag === 'check-prices') {
        event.waitUntil(doBackgroundCheck());
    }
});

async function doBackgroundCheck() {
    console.log('[SW] Performing background price check...');
    // This could be extended to periodically check prices in the background
    // However, browser support is limited and requires user interaction
}

// Message Handler - for communication with main app
self.addEventListener('message', event => {
    console.log('[SW] Message received:', event.data);

    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
