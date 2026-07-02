/* ==================================================================
 *  sw.js — Service Worker (PWA)
 *  - Cache offline básico del app shell
 *  - Manejo de click en notificaciones
 *  - Listener de push (stub) listo para FCM
 * ================================================================== */

const CACHE = "agenda-v2";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "notifications.js",
  "firebase-config.js",
  "manifest.json",
  "icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      // Cacheamos uno por uno: si falta algún archivo (ej: icon.png aún no
      // subido) no rompe el resto del cache.
      Promise.allSettled(SHELL.map((url) => c.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estrategia: network-first para navegación/JS del SDK, cache-first para el shell.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // No cacheamos llamadas a Firebase (tiempo real).
  if (url.hostname.includes("firebaseio.com") || url.hostname.includes("googleapis.com")) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});

// Click en notificación: enfocar/abrir la app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});

// Push (FCM) — stub. Cuando actives FCM, este handler lo maneja
// firebase-messaging-sw.js; aquí dejamos un fallback genérico.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const n = data.notification || {};
  const title = n.title || "Recordatorio";
  const options = {
    body: n.body || "",
    icon: "icon.png",
    badge: "icon.png",
    data: data.data || {},
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
