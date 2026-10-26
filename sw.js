// Quotebook app-shell cache: opens instantly from the Home Screen, then refreshes in the background.
const SHELL = "qbs-shell-v26";
const DATA = "qbs-data-v1";
// "/" on lovable.app, "/<repo>/" on GitHub Pages.
const BASE = new URL(self.registration.scope).pathname;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("qbs-") && k !== SHELL && k !== DATA) await caches.delete(k); // only this copy's caches
    await self.clients.claim();
  })());
});

function staleWhileRevalidate(event, cacheName, key) {
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(key);
    const network = fetch(event.request).then((res) => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    });
    if (cached) {
      event.waitUntil(network.catch(() => {}));
      return cached;
    }
    return network;
  })());
}

// Pages: try the network first so a new release shows on the next open; fall back to the cache when offline or slow.
function networkFirst(event, cacheName, key) {
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const network = fetch(event.request, { cache: "no-store" }).then((res) => { if (res.ok) cache.put(key, res.clone()); return res; });
    const timeout = new Promise((r) => setTimeout(r, 3500));
    const first = await Promise.race([network.catch(() => null), timeout]);
    if (first) return first;
    const cached = await cache.match(key);
    if (cached) { event.waitUntil(network.catch(() => {})); return cached; }
    return network;
  })());
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, Wikipedia, etc. go straight to the network
  if (url.pathname.startsWith("/~") || url.pathname.startsWith("/__")) return; // hosting/analytics scripts
  if (req.mode === "navigate" && url.pathname === BASE) return networkFirst(event, SHELL, BASE);
  if (url.pathname.startsWith(BASE + "assets/")) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  if (url.pathname === BASE + "quotes.json") return staleWhileRevalidate(event, DATA, BASE + "quotes.json");
});
