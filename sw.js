// Service worker: the app shell works offline; data.json and weather always
// try the network first so the brief is fresh, falling back to the last copy.
const CACHE = "morning-brief-v1";
const SHELL = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/config.js",
  "./js/app.js",
  "./js/wordle.js",
  "./js/crossword.js",
  "./data/words.json",
  "./data/crosswords.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // live data: network first, cached fallback
  const isLive = url.pathname.endsWith("/data/data.json") || url.origin !== location.origin;
  if (isLive) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (url.origin === location.origin && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // app shell: stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
