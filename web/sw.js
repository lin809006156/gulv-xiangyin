/**
 * 学易心音 · Service Worker
 * ---------------------------------------------------------------
 * 离线可用策略：
 *   应用外壳（HTML/CSS/JS/图标）→ 预缓存 + Cache First
 *   其他同源请求              → Stale While Revalidate
 *
 * 音频为实时合成，不产生网络请求，无需缓存策略。
 */

const CACHE = 'guaxiang-xinyin-v3';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './core/require-shim.js',
  './core/bootstrap.js',
  './core/data.js',
  './core/hexagram.js',
  './core/music.js',
  './core/render.js',
  './core/player.js',
  './core/recognize.js',
  './core/vision.js',
  './js/learn.js',
  './js/app.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 应用外壳：Cache First
  if (SHELL.some((p) => url.pathname.endsWith(p.replace('./', '/')))) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // 其他：Stale While Revalidate
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
