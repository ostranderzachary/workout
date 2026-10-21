// Offline support: the app shell is cached so it opens without signal.
// Network first, so a new version shows up as soon as you're online; the cache is the fallback.
// Map tiles and fonts aren't cached here (OpenStreetMap asks apps not to store tiles in bulk).
const CACHE = "musclemap-v2";
const SHELL = [
  "./", "index.html", "styles.css", "manifest.webmanifest",
  "js/app.js", "js/body.js", "js/cardio.js", "js/charts.js", "js/geo.js", "js/map.js", "js/recorder.js", "js/store.js", "js/util.js",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "icons/icon.svg", "icons/icon-192.png", "icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
