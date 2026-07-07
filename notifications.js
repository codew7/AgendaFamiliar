/* ==================================================================
 *  notifications.js — Notificaciones locales (Notification API + SW)
 *  ------------------------------------------------------------------
 *  Estrategia: un "ticker" revisa cada 30s los eventos de HOY y dispara
 *  la notificación cuando llega la hora (con margen de 2 min). Es más
 *  robusto que un setTimeout largo, porque los timers largos se cancelan
 *  cuando el sistema suspende la pestaña en segundo plano; en cambio, al
 *  volver a estar activa la pestaña, el ticker vuelve a revisar y dispara.
 *
 *  Anti-duplicados: guardamos en localStorage qué avisos ya se mostraron
 *  hoy (por evento + hora), así no se repiten aunque recargues.
 *
 *  Limitación conocida: si el móvil mantiene la PWA totalmente cerrada a
 *  la hora del evento, ningún JS corre y el aviso no se dispara. Para eso
 *  hace falta FCM (ver initFCM() y el README).
 * ================================================================== */

const Notifications = (() => {
  let ticker = null;
  let getTodaysEvents = null; // función provista por la app
  let moduleUser = null;

  function supported() {
    return "Notification" in window && "serviceWorker" in navigator;
  }

  // ---- Anti-duplicados (por día) ----
  function todayKey() {
    const d = new Date();
    return "agenda.notified." + d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function loadNotified() {
    try { return new Set(JSON.parse(localStorage.getItem(todayKey()) || "[]")); }
    catch { return new Set(); }
  }
  function saveNotified(set) {
    try { localStorage.setItem(todayKey(), JSON.stringify([...set])); } catch {}
  }
  // Limpia marcas de días anteriores para no acumular basura.
  function cleanupOldMarks() {
    try {
      const keep = todayKey();
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("agenda.notified.") && k !== keep) localStorage.removeItem(k);
      }
    } catch {}
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

  // Revisa los eventos de hoy y dispara los que ya llegaron a su hora.
  function check() {
    if (Notification.permission !== "granted" || !getTodaysEvents) return;
    const events = getTodaysEvents() || [];
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const notified = loadNotified();
    let changed = false;

    for (const ev of events) {
      if (!ev.time) continue;
      const [h, m] = ev.time.split(":").map(Number);
      const evMin = h * 60 + m;
      const key = ev.id + "@" + ev.time;

      // Dispara si estamos en el minuto del evento o hasta 2 min después,
      // y todavía no lo notificamos hoy.
      if (nowMin >= evMin && nowMin <= evMin + 2 && !notified.has(key)) {
        const who = !ev.forWho ? "los dos" : ev.forWho === moduleUser ? "vos" : ev.forWho;
        notify(`⏰ ${ev.desc}`, `${ev.time} · para ${who}`, { tag: ev.id });
        notified.add(key);
        changed = true;
      }
    }
    if (changed) saveNotified(notified);
  }

  /*  Arranca el ticker de notificaciones.
   *  getEventsFn: función que devuelve los eventos de HOY, cada uno
   *  { id, desc, time:"HH:MM", forWho }. user: nombre del usuario actual. */
  function start(getEventsFn, user) {
    getTodaysEvents = getEventsFn;
    moduleUser = user;
    cleanupOldMarks();
    if (ticker) clearInterval(ticker);
    check();
    ticker = setInterval(check, 30000);
  }

  // Fuerza una revisión inmediata (al abrir la app, cambios de datos, etc.).
  function refresh() {
    check();
  }

  /* ================================================================
   *  FCM (push real).
   *  Obtiene el token de este dispositivo y lo guarda en
   *  users/{name}/tokens/{token}. Una Cloud Function programada
   *  (functions/index.js) recorre los eventos cada minuto y envía el
   *  push a la hora correspondiente, aunque la app esté cerrada.
   *  Requiere: VAPID key en firebase-config.js + firebase-messaging-sw.js.
   * ================================================================ */
  let fcmReady = false;

  async function initFCM(_firebaseApp, db, userName) {
    const vapid = self.__FCM_VAPID_KEY__;
    if (!vapid) return;                       // FCM no configurado.
    if (fcmReady) return;                      // ya inicializado.
    if (!supported() || typeof firebase === "undefined" || !firebase.messaging) return;
    if (Notification.permission !== "granted") return; // necesita permiso.

    try {
      const messaging = firebase.messaging();
      // FCM registra automáticamente firebase-messaging-sw.js para el push.
      const token = await messaging.getToken({ vapidKey: vapid });
      if (token && db && userName) {
        await db.ref(`users/${userName}/tokens/${token}`).set(Date.now());
        fcmReady = true;
      }
      // Mensajes en primer plano (app abierta): los mostramos nosotros.
      messaging.onMessage((payload) => {
        const n = payload.notification || {};
        notify(n.title || "Recordatorio", n.body || "", payload.data || {});
      });
    } catch (e) {
      console.warn("FCM no disponible:", e);
    }
  }

  return { supported, requestPermission, notify, start, refresh, initFCM };
})();

window.Notifications = Notifications;
