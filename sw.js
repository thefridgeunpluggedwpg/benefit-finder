const CACHE = 'benefit-finder-v1.0.0';
const FILES = [
  './',
  'index.html',
  'css/app.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-192-maskable.png',
  'icons/icon-512-maskable.png',
  'icons/apple-touch-icon.png',
  'js/config.js',
  'js/programs.js',
  'js/match.js',
  'js/storage.js',
  'js/app.js',
  'vendor/fonts/fonts.css',
  "vendor/fonts/atkinson-hyperlegible-400-normal-1.woff2",
  "vendor/fonts/atkinson-hyperlegible-400-normal-2.woff2",
  "vendor/fonts/atkinson-hyperlegible-700-normal-3.woff2",
  "vendor/fonts/atkinson-hyperlegible-700-normal-4.woff2",
  "vendor/fonts/ibm-plex-serif-500-normal-5.woff2",
  "vendor/fonts/ibm-plex-serif-500-normal-6.woff2",
  "vendor/fonts/ibm-plex-serif-500-normal-7.woff2",
  "vendor/fonts/ibm-plex-serif-600-normal-10.woff2",
  "vendor/fonts/ibm-plex-serif-600-normal-8.woff2",
  "vendor/fonts/ibm-plex-serif-600-normal-9.woff2",
  "vendor/fonts/ibm-plex-serif-700-normal-11.woff2",
  "vendor/fonts/ibm-plex-serif-700-normal-12.woff2",
  "vendor/fonts/ibm-plex-serif-700-normal-13.woff2"
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
