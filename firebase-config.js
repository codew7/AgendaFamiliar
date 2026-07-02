/* ------------------------------------------------------------------
 *  CONFIGURACIÓN DE FIREBASE
 *  ------------------------------------------------------------------
 *  Pegá acá el objeto firebaseConfig de tu proyecto.
 *  Lo encontrás en: consola de Firebase → ⚙ Configuración del proyecto
 *  → "Tus apps" → app web → Configuración del SDK → "Config".
 *
 *  IMPORTANTE: debe incluir "databaseURL" (Realtime Database), por ej:
 *  https://TU-PROYECTO-default-rtdb.firebaseio.com
 * ------------------------------------------------------------------ */

const firebaseConfig = {
  apiKey: "AIzaSyAeouedI2-e0L3jEg92B6w1o3AhUao2FlQ",
  authDomain: "agendafamiliar-d9d7a.firebaseapp.com",
  databaseURL: "https://agendafamiliar-d9d7a-default-rtdb.firebaseio.com",
  projectId: "agendafamiliar-d9d7a",
  storageBucket: "agendafamiliar-d9d7a.firebasestorage.app",
  messagingSenderId: "284635242942",
  appId: "1:284635242942:web:c913054e6783af0528d9ef",
};

/* NOTIFICACIONES PUSH (FCM) — PEGÁ TU VAPID KEY ACÁ.
 * Consola de Firebase → ⚙ Configuración del proyecto → Cloud Messaging →
 * "Certificados push web" → Generar par de claves → copiá la clave.
 * Sin esto, la app usa solo notificaciones locales.                        */
const FCM_VAPID_KEY = "JgNotcd-2GkIlNTZmrokfAzNgojAYFRINvwNlEcUdBE";

// No tocar debajo de esta línea -------------------------------------
// Usamos "self" para que este archivo funcione tanto en la página (window)
// como dentro del Service Worker de mensajería (firebase-messaging-sw.js).
self.__FIREBASE_CONFIG__ = firebaseConfig;
self.__FCM_VAPID_KEY__ = FCM_VAPID_KEY;
