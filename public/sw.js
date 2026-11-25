const STATIC_CACHE = "njambo-static-v2";
const NOTIFICATION_ICON = "/assets/njambo/card-back.webp";
const IMAGE_CACHE = "njambo-images-v3";
const AUDIO_CACHE = "njambo-audio-v1";
const PAGE_CACHE = "njambo-pages-v2";
// Images et sons uploadés depuis l'admin (VPS, /uploads/<uuid>.<ext> : noms immuables).
const UPLOAD_CACHE = "njambo-uploads-v1";
const CACHES = [STATIC_CACHE, IMAGE_CACHE, AUDIO_CACHE, PAGE_CACHE, UPLOAD_CACHE];
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
  // Uploads (souvent servis par le VPS, autre origine) : cache d'abord, nom immuable.
  if (url.pathname.startsWith("/uploads/") && /\.(?:webp|avif|png|jpe?g|gif|mp3|ogg|wav|m4a)$/i.test(url.pathname)) {
    event.respondWith(caches.open(UPLOAD_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      // Une réponse opaque (<img> sans CORS) ne peut pas servir une requête CORS (fetch audio).
      if (cached && (cached.type !== "opaque" || event.request.mode === "no-cors")) return cached;
      const response = await fetch(event.request);
      if (response.ok || response.type === "opaque") {
        await cache.put(event.request, response.clone());
        void trim(UPLOAD_CACHE, 160);
      }
      return response;
    }));
    return;
  }

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

  if (/\.(?:mp3|ogg|wav|m4a)$/i.test(url.pathname)) {
    event.respondWith(caches.open(AUDIO_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        await cache.put(event.request, response.clone());
        void trim(AUDIO_CACHE, 80);
      }
      return response;
    }));
    return;
  }

  if (/\.(?:webp|avif|png|jpe?g|svg)$/i.test(url.pathname)) {
    event.respondWith(caches.open(IMAGE_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        await cache.put(event.request, response.clone());
        void trim(IMAGE_CACHE, 320);
      }
      return response;
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

/* ═══ Notifications push (FCM) ═══
   Les campagnes envoient un message « data » { title, body, link, tag,
   eventId } ; les anciens messages « notification » restent gérés. */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { body: event.data ? event.data.text() : "" } };
  }
  const data = payload.data || {};
  const notification = payload.notification || {};
  const title = data.title || notification.title || "Njambo";
  const link = data.link || (payload.fcmOptions && payload.fcmOptions.link) || (payload.fcm_options && payload.fcm_options.link) || "/";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || notification.body || "",
    icon: NOTIFICATION_ICON,
    tag: data.tag || notification.tag || undefined,
    data: { link, eventId: data.eventId || "" },
  }));
});

/* Clic : on réutilise l'onglet ouvert (message à l'app) ou on en ouvre un. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { link = "/", eventId = "" } = event.notification.data || {};
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      existing.postMessage({ type: "njambo:open-link", link, eventId });
      return;
    }
    await self.clients.openWindow(new URL(link, self.location.origin).href);
  })());
});
