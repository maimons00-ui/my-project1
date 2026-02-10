/**
 * Service Worker for Sensor Dashboard PWA
 * Provides offline functionality and caching
 */

const CACHE_NAME = 'sensor-dashboard-v2.0';
const OFFLINE_URL = '/sensor_dashboard.html';

// Resources to cache
const RESOURCES_TO_CACHE = [
    '/',
    '/sensor_dashboard.html',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[ServiceWorker] Caching resources');
                return cache.addAll(RESOURCES_TO_CACHE);
            })
            .then(() => {
                console.log('[ServiceWorker] Installed successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[ServiceWorker] Install failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[ServiceWorker] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[ServiceWorker] Activated successfully');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip API requests (let them go to network)
    if (event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached version
                    return cachedResponse;
                }

                // Try network
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Check if valid response
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }

                        // Clone response for caching
                        const responseToCache = networkResponse.clone();

                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return networkResponse;
                    })
                    .catch((error) => {
                        console.log('[ServiceWorker] Fetch failed:', error);
                        
                        // Return offline page for navigation requests
                        if (event.request.mode === 'navigate') {
                            return caches.match(OFFLINE_URL);
                        }
                        
                        return new Response('Offline', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});

// Background sync for data
self.addEventListener('sync', (event) => {
    console.log('[ServiceWorker] Sync event:', event.tag);
    
    if (event.tag === 'sync-sensor-data') {
        event.waitUntil(syncSensorData());
    }
});

// Push notifications
self.addEventListener('push', (event) => {
    console.log('[ServiceWorker] Push received');
    
    let data = { title: 'התראה', body: 'יש התראה חדשה' };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏠</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚠️</text></svg>',
        vibrate: [200, 100, 200],
        tag: 'sensor-alert',
        renotify: true,
        requireInteraction: true,
        dir: 'rtl',
        lang: 'he',
        actions: [
            { action: 'view', title: 'צפה', icon: '👁️' },
            { action: 'dismiss', title: 'סגור', icon: '❌' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[ServiceWorker] Notification clicked:', event.action);
    
    event.notification.close();

    if (event.action === 'dismiss') {
        return;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Focus existing window if open
                for (const client of clientList) {
                    if (client.url.includes('sensor_dashboard') && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                // Open new window
                if (clients.openWindow) {
                    return clients.openWindow('/sensor_dashboard.html');
                }
            })
    );
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
    console.log('[ServiceWorker] Periodic sync:', event.tag);
    
    if (event.tag === 'check-sensors') {
        event.waitUntil(checkSensors());
    }
});

// Helper function to sync sensor data
async function syncSensorData() {
    try {
        // This would sync with your backend server
        console.log('[ServiceWorker] Syncing sensor data...');
        
        // Get cached data
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match('/api/sensors');
        
        if (response) {
            // Send to server when online
            // await fetch('/api/sync', { method: 'POST', body: await response.text() });
        }
        
        console.log('[ServiceWorker] Sync complete');
    } catch (error) {
        console.error('[ServiceWorker] Sync failed:', error);
    }
}

// Helper function to check sensors
async function checkSensors() {
    try {
        console.log('[ServiceWorker] Checking sensors...');
        
        const response = await fetch('/api/sensors');
        if (response.ok) {
            const data = await response.json();
            
            // Check for alerts
            const alerts = [];
            
            if (data.gas && data.gas.monthly > 40) {
                alerts.push('צריכת גז גבוהה');
            }
            if (data.water && data.water.monthly > 12) {
                alerts.push('צריכת מים גבוהה');
            }
            if (data.electricity && data.electricity.monthly > 400) {
                alerts.push('צריכת חשמל גבוהה');
            }
            
            // Show notification if there are alerts
            if (alerts.length > 0) {
                await self.registration.showNotification('התראת חיישנים', {
                    body: alerts.join(', '),
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚠️</text></svg>',
                    tag: 'sensor-check',
                    dir: 'rtl',
                    lang: 'he'
                });
            }
        }
    } catch (error) {
        console.error('[ServiceWorker] Check failed:', error);
    }
}

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
    console.log('[ServiceWorker] Message received:', event.data);
    
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
    
    if (event.data.action === 'showNotification') {
        self.registration.showNotification(event.data.title, event.data.options);
    }
});

console.log('[ServiceWorker] Script loaded');
