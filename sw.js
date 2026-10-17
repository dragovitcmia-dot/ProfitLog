/* ProfitLog service worker: precache the whole app, serve it cache-first, and
   update only when the person taps "Update" (see js/ui/pwa.js).
   VERSION and the PRECACHE list are rewritten by `npm run stamp` — do not edit by hand. */

const VERSION = 'b8542caf2c';
const CACHE = `profitlog-${VERSION}`;
/* PRECACHE:START */
const PRECACHE = [
  './',
  './css/app.css',
  './css/theme.css',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon-maskable.svg',
  './icons/icon.svg',
  './index.html',
  './js/core/dates.js',
  './js/core/demo.js',
  './js/core/io.js',
  './js/core/money.js',
  './js/core/stats.js',
  './js/data/db.js',
  './js/data/store.js',
  './js/main.js',
  './js/theme-boot.js',
  './js/ui/app.js',
  './js/ui/charts.js',
  './js/ui/components.js',
  './js/ui/dom.js',
  './js/ui/exporters.js',
  './js/ui/icons.js',
  './js/ui/modal.js',
  './js/ui/pwa.js',
  './js/ui/router.js',
  './js/ui/saleform.js',
  './js/ui/toast.js',
  './js/version.js',
  './js/views/dashboard.js',
  './js/views/history.js',
  './js/views/home.js',
  './js/views/importflow.js',
  './js/views/settings.js',
  './manifest.webmanifest',
];
/* PRECACHE:END */

self.addEventListener('install', (event) => {
  // No skipWaiting() here: a new version waits until the person accepts the update prompt.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('profitlog-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch (err) {
        if (req.mode === 'navigate') {
          const shell = (await cache.match('./index.html')) || (await cache.match('./'));
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});
