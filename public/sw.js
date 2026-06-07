// A basic service worker to satisfy Chrome PWA install requirements
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // IMPORTANT: For a simple passthrough Service Worker, do NOT use event.respondWith().
  // Calling event.respondWith(fetch(event.request)) can break Vite's HMR, Server-Sent Events, 
  // and cause Uncaught Promise rejections if the network disconnects.
  // Leaving this empty allows the browser to handle all network requests natively.
});
