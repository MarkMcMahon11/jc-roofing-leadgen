// PowerMac Connect field app service worker: keeps the app shell and field pages available
// with no signal. Updates made offline are queued by the page (outbox) and sent later.
const CACHE = "pmc-field-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // static build assets never change for a given URL: cache first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }

  // field pages: network first, fall back to the last copy seen on this phone
  if (req.mode === "navigate" && url.pathname.startsWith("/field")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/field")).then((hit) => hit || new Response(
          "<!doctype html><meta name=viewport content='width=device-width'><body style='font-family:sans-serif;background:#060a14;color:#e8edf7;padding:24px'><h1>No signal</h1><p>This page has not been opened on this phone yet. Open it again when you have signal.</p>",
          { headers: { "Content-Type": "text/html" } },
        ))),
    );
  }
});
