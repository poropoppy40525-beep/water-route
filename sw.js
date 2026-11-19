// Service worker for the installed app. The app screen and libraries are kept on the phone so it opens without signal;
// customer data and saving always go to Google Sheets (records wait in the app's outbox while offline).
const VERSION = 'd73d2e6b4f';
const SHELL = 'shell-' + VERSION, TILES = 'tiles-v1';
const PRECACHE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;                                         // saving data: always the network
  if (/script\.google|googleusercontent|project-osrm|google\.com\/maps/.test(url.href)) return;   // live data: never cached
  if (/tile\.openstreetmap\.org/.test(url.hostname)) {                      // map tiles: reuse what was seen before
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trim(c); }
      return res;
    }).catch(() => fetch(req)));
    return;
  }
  if (req.mode === 'navigate' || url.origin === location.origin) {         // app screen: newest when online, saved copy offline
    e.respondWith(fetch(req).then(res => {
      if (res.ok) caches.open(SHELL).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {   // fonts and libraries
    if (res.ok || res.type === 'opaque') caches.open(SHELL).then(c => c.put(req, res.clone()));
    return res;
  })));
});
let trimming = false;
async function trim(c) {
  if (trimming) return; trimming = true;
  try { const keys = await c.keys(); for (const k of keys.slice(0, Math.max(0, keys.length - 1500))) await c.delete(k); }
  finally { trimming = false; }
}
