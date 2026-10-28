// Service worker: menyimpan salinan file aplikasi supaya tetap bisa dibuka tanpa internet.
//
// Strategi "jaringan dulu": saat online, file selalu diambil dari GitHub Pages (cepat, karena
// browser cukup menanyakan "sudah berubah belum?") dan salinannya diperbarui. Saat offline atau
// jaringan macet, dipakai salinan terakhir. Jadi pembaruan aplikasi otomatis sampai ke semua
// perangkat; tidak perlu menaikkan nomor versi apa pun.
const CACHE = 'baca-novel-app';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/merge.js',
  'js/parse.js',
  'js/sync.js',
  'js/zip.js',
  'js/epub.js',
  'js/epubin.js',
  'fonts/noto-serif-latin.woff2',
  'fonts/source-serif-4-latin.woff2',
  'fonts/roboto-latin.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];
const TIMEOUT = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('baca-novel-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Semua navigasi memakai index.html (aplikasi satu halaman dengan rute di #hash).
  const key = req.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : url.origin + url.pathname;
  e.respondWith(networkFirst(key));
});

async function networkFirst(key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(key, { cache: 'no-cache' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT)),
    ]);
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw err;
  }
}
