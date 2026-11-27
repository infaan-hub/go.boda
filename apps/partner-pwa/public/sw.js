const CACHE_NAME = "goboda-partner-v3";
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
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Go.Boda — Live Update";
  const body = data.body || "Open Go.Boda Rider-Driver for live details.";
  const targetUrl = data.url || "/partner/notifications";
  const tag = data.tag || data.eventSubject || "goboda-partner";

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon: "/partner/icons/icon.svg",
        badge: "/partner/icons/icon.svg",
        tag,
        renotify: true,
        vibrate: [220, 100, 220, 100, 320],
        requireInteraction: data.eventSubject === "dispatch.offer_sent",
        data: { url: targetUrl, eventSubject: data.eventSubject || "partner.push" },
      }),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clientList) => {
          for (const client of clientList) {
            client.postMessage({
              type: "GOBODA_PUSH_RECEIVED",
              payload: { title, body, url: targetUrl, eventSubject: data.eventSubject },
            });
          }
        }),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/partner/shift";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes("/partner/") && "focus" in client) {
            client.navigate(targetUrl).catch(() => null);
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
