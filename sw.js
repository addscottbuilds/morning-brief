// Install a coherent app shell for offline use. The digest checks the network
// and keeps a readable saved copy if that check fails.
const CACHE = "morning-brief-v39";
const SHELL = [
  "./edition-v34.html",
  "./css/edition-base.css",
  "./css/edition.css",
  "./css/news-redesign.css",
  "./css/games-redesign.css",
  "./js/config.js",
  "./js/edition-theme.js",
  "./js/news-redesign.js",
  "./js/edition-app.js",
  "./js/wordle-edition.js",
  "./js/crossword-edition.js",
  "./js/connections.js",
  "./js/games-redesign.js",
  "./data/words.json",
  "./data/crosswords.json",
  "./data/connections.json",
  "./manifest.webmanifest",
  "./icons/daylight-180.png",
  "./icons/daylight-192.png",
  "./icons/daylight-512.png",
];

const SCOPE_URL = new URL(self.registration.scope);
const EDITION_URL = new URL("edition-v34.html", SCOPE_URL);
const INDEX_PATH = new URL("index.html", SCOPE_URL).pathname;
const DIGEST_URL = new URL("data/data.json", SCOPE_URL);
const puzzlePaths = new Set(SHELL.filter(path => path.startsWith("./data/"))
  .map(path => new URL(path, self.registration.scope).pathname));
const shellPaths = new Set(SHELL.filter(path => !path.startsWith("./data/"))
  .map(path => new URL(path, self.registration.scope).pathname));

async function installShell() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL.map(path => new Request(path, { cache: "reload" })));
  const hasOlderShell = (await caches.keys()).some(key => /^morning-brief-v\d+$/.test(key) && key !== CACHE);
  if (!hasOlderShell) {
    // An uncontested first installation can save the digest before its first controlled reload.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(DIGEST_URL, { cache: "no-cache", signal: controller.signal });
      if (response.ok && isDigest(await response.clone().json())) await cache.put(DIGEST_URL, response);
    } catch {
      // A failed digest check must not stop the shell from installing.
    } finally {
      clearTimeout(timeout);
    }
  }
  await self.skipWaiting();
}

self.addEventListener("install", event => {
  event.waitUntil(installShell());
});

function isDigest(data) {
  return Number.isFinite(Date.parse(data?.generatedAt))
    && Array.isArray(data.markets?.items)
    && (Array.isArray(data.news?.categories) || Array.isArray(data.news?.stories));
}

async function activateCache() {
  const previous = (await caches.keys()).filter(key => /^morning-brief-v\d+$/.test(key) && key !== CACHE).reverse();
  const digestUrl = DIGEST_URL.href;
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

self.addEventListener("message", event => {
  if (event.data !== "morning-brief-edition-check" || !event.ports[0]) return;
  event.waitUntil(caches.open(CACHE).then(cache => cache.match(EDITION_URL)).then(edition => {
    if (edition) event.ports[0].postMessage("morning-brief-edition-ready");
  }));
});

// Morning push notification (sent by the daily GitHub Action)
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* plain-text payload */ d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Morning Brief", {
    body: d.body || "Your daily brief is ready.",
    icon: "icons/daylight-192.png",
    badge: "icons/daylight-192.png",
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

async function latestDigest(request) {
  try {
    const response = await fetch(request);
    if (!response.ok || !isDigest(await response.clone().json())) throw new Error("Invalid digest");
    const copy = response.clone();
    await caches.open(CACHE).then(cache => cache.put(DIGEST_URL, copy)).catch(() => {});
    return response;
  } catch {
    const current = await caches.open(CACHE);
    const saved = (await current.match(DIGEST_URL)) || await caches.match(DIGEST_URL);
    if (!saved) return Response.error();
    const headers = new Headers(saved.headers);
    headers.set("X-Morning-Cache", "saved");
    return new Response(saved.body, { status: saved.status, headers });
  }
}

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== DIGEST_URL.origin) return;

  if (request.mode === "navigate" && [SCOPE_URL.pathname, INDEX_PATH].includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(EDITION_URL)) || fetch(request)));
  } else if (url.pathname === DIGEST_URL.pathname) {
    event.respondWith(latestDigest(request));
  } else if (shellPaths.has(url.pathname)) {
    // Keep one version's HTML and assets together until the next worker installs them.
    event.respondWith(caches.open(CACHE).then(async cache =>
      (await cache.match(request, { ignoreSearch: request.mode === "navigate" })) || fetch(request)
    ));
  } else if (puzzlePaths.has(url.pathname)) {
    // Puzzle banks can grow without a shell update. Refresh them in the background.
    const fresh = fetch(request).then(async response => {
      if (!response.ok) throw new Error("Puzzle bank unavailable");
      const copy = response.clone();
      await caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
      return response;
    }).catch(() => Response.error());
    event.waitUntil(fresh);
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(request)) || fresh));
  }
});
