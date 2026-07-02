/* ==================================================================
 *  functions/index.js — Envío de recordatorios push (FCM)
 *  ------------------------------------------------------------------
 *  Función programada que corre CADA MINUTO, revisa los eventos cuya
 *  hora coincide con el minuto actual (en horario de Argentina) y envía
 *  una notificación push al usuario destinatario, aunque tenga la app
 *  cerrada.
 *
 *  Requiere plan Blaze (Cloud Functions + Cloud Scheduler).
 * ================================================================== */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.database();

// Zona horaria de referencia para interpretar las horas de los eventos.
const TZ = "America/Argentina/Buenos_Aires";

const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Devuelve { date:"YYYY-MM-DD", hm:"HH:MM", weekday:0-6 } en la zona TZ.
function nowParts() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now); // en-CA => "2026-07-02"
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now); // "13:45"
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "short",
  }).format(now); // "Thu"
  return { date, hm: hm === "24:00" ? "00:00" : hm, weekday: WEEKDAY_MAP[wd] };
}

exports.sendReminders = onSchedule(
  { schedule: "every 1 minutes", timeZone: TZ },
  async () => {
    const { date, hm, weekday } = nowParts();

    const [eventsSnap, usersSnap] = await Promise.all([
      db.ref("events").once("value"),
      db.ref("users").once("value"),
    ]);
    const events = eventsSnap.val() || {};
    const users = usersSnap.val() || {};

    let sent = 0;

    for (const [id, ev] of Object.entries(events)) {
      if (!ev || !ev.time || ev.time !== hm) continue;

      const matches =
        ev.type === "weekly"
          ? Number(ev.weekday) === weekday
          : ev.date === date;
      if (!matches) continue;

      // Anti-duplicados: no reenviar el mismo evento el mismo día.
      const dedupRef = db.ref(`notified/${date}/${id}`);
      if ((await dedupRef.once("value")).exists()) continue;

      const target = ev.forWho; // "Vani" | "Ale"
      const tokens = Object.keys((users[target] && users[target].tokens) || {});

      if (tokens.length) {
        const message = {
          notification: {
            title: `⏰ ${ev.desc}`,
            body: `Hoy a las ${ev.time}`,
          },
          webpush: {
            notification: { icon: "/icon.png", badge: "/icon.png" },
            fcmOptions: { link: "/" },
          },
          tokens,
        };

        const resp = await admin.messaging().sendEachForMulticast(message);
        sent += resp.successCount;

        // Limpieza de tokens inválidos (dispositivos que ya no aplican).
        resp.responses.forEach((r, i) => {
          if (!r.success) {
            const code = r.error && r.error.code;
            if (
              code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-registration-token"
            ) {
              db.ref(`users/${target}/tokens/${tokens[i]}`).remove();
            }
          }
        });
      }

      await dedupRef.set(true);
    }

    // Limpieza: borra las marcas de días anteriores.
    const notifiedSnap = await db.ref("notified").once("value");
    const notified = notifiedSnap.val() || {};
    await Promise.all(
      Object.keys(notified)
        .filter((d) => d !== date)
        .map((d) => db.ref(`notified/${d}`).remove())
    );

    logger.info(`sendReminders ${date} ${hm}: ${sent} push enviados`);
  }
);
