const CACHE = 'tww-shell-v0.3.0';
const FONT_CACHE = 'tww-fonts';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'js/config.js',
  'js/api.js',
  'js/store.js',
  'js/router.js',
  'js/dom.js',
  'js/format-th.js',
  'js/app.js',
  'js/views/login.js',
  'js/views/library.js',
  'js/views/placeholder.js',
  'js/engine/calc.js',
  'js/engine/expr.js',
  'js/engine/format.js',
  'js/engine/index.js',
  'js/engine/modules.js',
  'js/engine/numscan.js',
  'js/engine/spec.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('tww-shell-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

const API_HOSTS = ['script.google.com', 'script.googleusercontent.com'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (API_HOSTS.includes(url.hostname)) return;

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        if (hit) return hit;
        return net.then((res) => {
          if (res) return res;
          if (req.mode === 'navigate') return cache.match('index.html');
          return Response.error();
        });
      })
    )
  );
});
