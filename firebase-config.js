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

// No tocar debajo de esta línea -------------------------------------
self.__FIREBASE_CONFIG__ = firebaseConfig;
