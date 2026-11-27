const CACHE_NAME = "goboda-partner-v2";
const OFFLINE_URL = "/partner/offline";
const PRECACHE_URLS = [OFFLINE_URL, "/partner/manifest.webmanifest", "/partner/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("goboda-partner-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Cache-First for immutable Next.js static chunks & icons (fast 3G resume)
  if (
    url.pathname.startsWith("/partner-static/_next/static/") ||
    url.pathname.startsWith("/partner/icons/")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      })
    );
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached || Response.error();
      })
    );
  }
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Go.boda — New Nearby Request";
  const body = data.body || "Tap within 20 seconds to accept.";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/partner/icons/icon.svg",
      badge: "/partner/icons/icon.svg",
      vibrate: [250, 120, 250, 120, 400],
      requireInteraction: true,
      data: { url: data.url || "/partner" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.openWindow(targetUrl));
});
