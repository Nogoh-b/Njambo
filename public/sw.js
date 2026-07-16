const STATIC_CACHE = "njambo-static-v2";
const IMAGE_CACHE = "njambo-images-v2";
const PAGE_CACHE = "njambo-pages-v2";
const CACHES = [STATIC_CACHE, IMAGE_CACHE, PAGE_CACHE];
const SHELL = ["/", "/manifest.webmanifest"];

async function trim(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGE_CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => !CACHES.includes(key)).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/image")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        await cache.put(event.request, response.clone());
        void trim(STATIC_CACHE, 120);
      }
      return response;
    }));
    return;
  }

  if (/\.(?:webp|avif|png|jpe?g|svg)$/i.test(url.pathname)) {
    event.respondWith(caches.open(IMAGE_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request).then(async (response) => {
        if (response.ok) {
          await cache.put(event.request, response.clone());
          void trim(IMAGE_CACHE, 40);
        }
        return response;
      });
      return cached || network;
    }));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then(async (response) => {
      if (response.ok) await (await caches.open(PAGE_CACHE)).put(event.request, response.clone());
      return response;
    }).catch(async () => (await caches.match(event.request)) || (await caches.match("/"))));
  }
});
