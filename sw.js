/* Vectra service worker: fast repeat visits + basic offline browsing. Never caches the admin panel or Supabase calls. */
const CACHE = "vectra-v3";
const SHELL = ["/", "/styles.css", "/app.js", "/shared.js", "/config.js", "/products.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting())) });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())) });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || /^\/(admin|track)/.test(u.pathname) || /^\/(admin|track)\.(js|css|html)$/.test(u.pathname) || u.pathname === "/sw.js") return;
  if (r.mode === "navigate") { e.respondWith(fetch(r).then(x => { const c = x.clone(); caches.open(CACHE).then(k => k.put(r, c)); return x }).catch(() => caches.match(r).then(x => x || caches.match("/")))); return }
  if (u.pathname.startsWith("/product/") || u.pathname.startsWith("/icons/")) { e.respondWith(caches.match(r).then(x => x || fetch(r).then(y => { const c = y.clone(); caches.open(CACHE).then(k => k.put(r, c)); return y }))); return }
  e.respondWith(caches.match(r).then(x => { const n = fetch(r).then(y => { if (y.ok) { const c = y.clone(); caches.open(CACHE).then(k => k.put(r, c)) } return y }).catch(() => x); return x || n }));
});
