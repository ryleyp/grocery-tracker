const CACHE = 'grocery-tracker-v11';

const APP_SHELL = [
  '.',
  'index.html',
  'css/styles.css?v=11',
  'js/app.js?v=11',
  'js/store.js',
  'js/parser.js',
  'js/foodData.js',
  'js/productInfo.js',
  'js/ocr.js',
  'js/version.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

const APP_SHELL_PATHS = new Set(APP_SHELL.map((path) => new URL(path, self.registration.scope).pathname));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function shouldRefreshFirst(request) {
  const url = new URL(request.url);
  if (url.origin !== location.origin) return false;
  if (request.mode === 'navigate') return true;
  return APP_SHELL_PATHS.has(url.pathname);
}

function fetchAndCache(request) {
  return fetch(request).then((res) => {
    if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  });
}

// App shell files are network-first so the URL picks up new deploys quickly.
// Runtime assets, including vendored OCR files, stay cache-first for offline use.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (shouldRefreshFirst(e.request)) {
    e.respondWith(fetchAndCache(e.request).catch(() => caches.match(e.request)));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetchAndCache(e.request)
    )
  );
});
