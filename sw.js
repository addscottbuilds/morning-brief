// Service worker: the app shell works offline; data.json and weather always
// try the network first so the brief is fresh, falling back to the last copy.
const CACHE = "morning-brief-v33";
const SHELL = [
  "./",
  "./index.html",
  "./css/app-v33.css",
  "./js/config.js",
  "./js/app-v33.js",
  "./js/wordle-v33.js",
  "./js/crossword-v33.js",
  "./js/connections.js",
  "./data/words.json",
  "./data/crosswords.json",
  "./data/connections.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", e => {
  const shellRequests = SHELL.map(url => new Request(url, { cache: "reload" }));
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(shellRequests)).then(() => self.skipWaiting()));
});

function isDigest(data) {
  return Number.isFinite(Date.parse(data?.generatedAt))
    && Array.isArray(data.markets?.items)
    && (Array.isArray(data.news?.categories) || Array.isArray(data.news?.stories));
}

async function activateCache() {
  const previous = (await caches.keys()).filter(key => /^morning-brief-v\d+$/.test(key) && key !== CACHE).reverse();
  const digestUrl = new URL("data/data.json", self.registration.scope).href;
  const current = await caches.open(CACHE);
  let retainedCache;
  if (!await current.match(digestUrl)) {
    for (const key of previous) {
      let saved;
      try {
        saved = await (await caches.open(key)).match(digestUrl);
        if (!saved?.ok || !isDigest(await saved.clone().json())) continue;
      } catch {
        continue;
      }
      try {
        await current.put(digestUrl, saved);
      } catch {
        // A storage failure must not delete the last usable digest.
        retainedCache = key;
      }
      break;
    }
  }
  await Promise.all(previous.filter(key => key !== retainedCache).map(key => caches.delete(key)));
  await self.clients.claim();
}

self.addEventListener("activate", e => {
  e.waitUntil(activateCache());
});

// Morning push notification (sent by the daily GitHub Action)
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* plain-text payload */ d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Morning Brief", {
    body: d.body || "Your daily brief is ready.",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: "morning-brief-daily",
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) if ("focus" in c) return c.focus();
      return clients.openWindow("./");
    })
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
        .then(async res => {
          if (url.origin === location.origin && !res.ok) throw new Error("Source request failed");
          if (url.origin === location.origin) {
            const body = await res.clone().json();
            if (!isDigest(body)) throw new Error("Invalid digest");
            const copy = res.clone();
            await caches.open(CACHE).then(cache => cache.put(e.request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(async () => { const saved = await caches.match(e.request); if (!saved) return Response.error(); const headers = new Headers(saved.headers); headers.set("X-Morning-Cache", "saved"); return new Response(await saved.blob(), { status: saved.status, headers }); })
    );
    return;
  }

  // app shell: stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request)
        .then(async res => {
          if (res.ok) {
            const copy = res.clone();
            await caches.open(CACHE).then(cache => cache.put(e.request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
