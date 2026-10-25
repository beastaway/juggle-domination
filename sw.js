// Juggle Jumps service worker: works offline after the first visit.
const V = "jj-v1";
const SHELL = ["./", "index.html", "app.js", "scene.js", "audio.js", "camera.js", "detector.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== "jj-cdn").map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.hostname === "formsubmit.co") return;
  if (u.origin === location.origin) {
    // app files: network first (so updates arrive), cache as fallback
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
  } else if (/cdn\.jsdelivr\.net|storage\.googleapis\.com|fonts\.(googleapis|gstatic)\.com/.test(u.hostname)) {
    // counter models and fonts: cache first (they never change)
    e.respondWith(caches.open("jj-cdn").then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok || r.type === "opaque") c.put(e.request, r.clone()); return r; })));
  }
});
