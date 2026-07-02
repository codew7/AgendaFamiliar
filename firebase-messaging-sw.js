/* ==================================================================
 *  firebase-messaging-sw.js — Service Worker de FCM (push en segundo plano)
 *  ------------------------------------------------------------------
 *  Se registra automáticamente cuando la app pide el token (getToken).
 *  Muestra la notificación cuando llega un push y la app está cerrada
 *  o en segundo plano. (Con la app abierta, el aviso lo maneja onMessage
 *  en notifications.js.)
 * ================================================================== */

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
importScripts("firebase-config.js"); // define self.__FIREBASE_CONFIG__

firebase.initializeApp(self.__FIREBASE_CONFIG__);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || "Recordatorio", {
    body: n.body || "",
    icon: "icon.png",
    badge: "icon.png",
    data: payload.data || {},
    vibrate: [80, 40, 80],
  });
});

// Al tocar la notificación, enfocar/abrir la app.
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
