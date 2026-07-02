/* ==================================================================
 *  notifications.js — Notificaciones locales (Notification API + SW)
 *  ------------------------------------------------------------------
 *  Estrategia actual: mientras la app está abierta (o fue abierta hace
 *  poco), programamos un setTimeout por cada evento de HOY que todavía
 *  no pasó y disparamos la notificación vía el Service Worker.
 *
 *  Limitación conocida: si el móvil mata la pestaña/PWA en segundo
 *  plano, los timers no sobreviven y la notificación puede no dispararse
 *  a la hora exacta. Para notificaciones 100% confiables con la app
 *  cerrada hay que activar FCM (ver initFCM() más abajo y el README).
 * ================================================================== */

const Notifications = (() => {
  const scheduled = new Map(); // eventId -> timeoutId

  function supported() {
    return "Notification" in window && "serviceWorker" in navigator;
  }

  async function requestPermission() {
    if (!supported()) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    try {
      return await Notification.requestPermission();
    } catch {
      return "denied";
    }
  }

  // Muestra una notificación ya mismo (a través del SW si está disponible).
  async function notify(title, body, data = {}) {
    if (!supported() || Notification.permission !== "granted") return;
    const options = {
      body,
      icon: "icon.png",
      badge: "icon.png",
      tag: data.tag || undefined,
      data,
      vibrate: [80, 40, 80],
    };
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
    } catch {
      // Fallback si el SW no está listo
      new Notification(title, options);
    }
  }

  // Cancela todos los timers programados.
  function clearScheduled() {
    for (const id of scheduled.values()) clearTimeout(id);
    scheduled.clear();
  }

  /*  Programa notificaciones para una lista de eventos de HOY.
   *  Cada evento: { id, desc, time:"HH:MM", forWho }
   *  currentUser sirve para personalizar el texto.               */
  function scheduleForDay(events, currentUser) {
    clearScheduled();
    if (Notification.permission !== "granted") return;

    const now = Date.now();
    for (const ev of events) {
      if (!ev.time) continue;
      const [h, m] = ev.time.split(":").map(Number);
      const when = new Date();
      when.setHours(h, m, 0, 0);
      const delay = when.getTime() - now;

      // Solo eventos futuros dentro de las próximas 24h.
      if (delay <= 0 || delay > 24 * 60 * 60 * 1000) continue;

      const who = ev.forWho === currentUser ? "vos" : ev.forWho;
      const timeoutId = setTimeout(() => {
        notify(`⏰ ${ev.desc}`, `${ev.time} · para ${who}`, { tag: ev.id });
        scheduled.delete(ev.id);
      }, delay);
      scheduled.set(ev.id, timeoutId);
    }
  }

  /* ================================================================
   *  FCM (push real) — STUB para completar más adelante.
   *  Pasos para activarlo (ver README):
   *   1. Agregar el SDK de messaging en index.html:
   *      firebase-messaging-compat.js
   *   2. Poner la VAPID key en firebase-config.js (FCM_VAPID_KEY).
   *   3. Crear firebase-messaging-sw.js en la raíz.
   *   4. Descomentar el cuerpo de esta función.
   *   5. Guardar el token en users/{name}/fcmToken.
   *   6. Enviar el push desde una Cloud Function programada que
   *      recorra los eventos y notifique a la hora correspondiente.
   * ================================================================ */
  async function initFCM(_firebaseApp, _db, _userName) {
    const vapid = window.__FCM_VAPID_KEY__;
    if (!vapid) return; // FCM no configurado todavía.

    // --- Descomentar cuando se agregue firebase-messaging-compat.js ---
    // try {
    //   const messaging = firebase.messaging();
    //   const reg = await navigator.serviceWorker.ready;
    //   const token = await messaging.getToken({
    //     vapidKey: vapid,
    //     serviceWorkerRegistration: reg,
    //   });
    //   if (token) {
    //     await _db.ref(`users/${_userName}/fcmToken`).set(token);
    //   }
    //   messaging.onMessage((payload) => {
    //     const n = payload.notification || {};
    //     notify(n.title || "Recordatorio", n.body || "", payload.data || {});
    //   });
    // } catch (e) {
    //   console.warn("FCM no disponible:", e);
    // }
  }

  return { supported, requestPermission, notify, scheduleForDay, clearScheduled, initFCM };
})();

window.Notifications = Notifications;
