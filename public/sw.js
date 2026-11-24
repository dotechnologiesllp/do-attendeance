// Do Attendance service worker: makes the app installable and quick to open on slow networks.
// Static assets are cached; pages and API calls always go to the network (attendance must be live).
const CACHE = "do-attendance-v1";
const OFFLINE_HTML = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Offline</title>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;color:#0d0d0d">
<div style="text-align:center;padding:24px"><h1 style="font-size:20px">You're offline</h1>
<p style="color:#6e6e73">Attendance needs an internet connection so the punch uses server time.<br>Reconnect and try again.</p>
<button onclick="location.reload()" style="margin-top:12px;height:44px;padding:0 18px;border-radius:12px;border:0;background:#0d0d0d;color:#fff">Retry</button></div>`;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/icons/icon-192.png", "/icons/icon-512.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html" } })));
  }
});
