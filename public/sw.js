// A basic service worker to satisfy Chrome PWA install requirements
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // We just let the request pass through
  event.respondWith(fetch(event.request));
});
