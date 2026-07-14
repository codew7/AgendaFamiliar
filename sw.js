/* ==================================================================
 *  sw.js — Service Worker (PWA)
 *  - Cache offline básico del app shell
 * ================================================================== */

const CACHE = "agenda-v10";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // No cacheamos llamadas a Firebase (tiempo real).
  if (url.hostname.includes("firebaseio.com") || url.hostname.includes("googleapis.com")) {
    return;
  }
  // Solo manejamos recursos de nuestro propio origen.
  if (url.origin !== self.location.origin) return;

  // El HTML y el manifest van NETWORK-FIRST: así las actualizaciones
  // (incluido el manifest para instalar la PWA) llegan enseguida y no
  // quedan pegadas a una versión vieja del cache.
  const isDoc = req.mode === "navigate" || url.pathname.endsWith(".html");
  const isManifest = url.pathname.endsWith("manifest.json");

  if (isDoc || isManifest) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // El resto (CSS, JS, íconos): CACHE-FIRST con revalidación en segundo plano.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
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
