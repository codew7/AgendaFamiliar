# AgendaFamiliar

PWA minimalista para agendar y ver actividades diarias, con backend en **Firebase
Realtime Database**, chat simple entre los dos usuarios y notificaciones locales.
Sin paso de build: HTML + CSS + JS vanilla.

## Características
- Dos usuarios fijos (**Vani** / **Ale**), identificación por nombre guardado en
  `localStorage` (no se vuelve a pedir).
- Agenda por día con navegación entre días.
- Actividades **puntuales** (con fecha) o **recurrentes** (cada semana).
- Cada uno puede crear eventos para sí mismo o para el otro.
- Sincronización en tiempo real (Realtime Database).
- Chat de recordatorios con badge de no leídos.
- Notificaciones locales a la hora del evento.
- **Modo nocturno** con preferencia guardada en `localStorage`.
- Instalable como PWA en Android / iOS con ícono propio (`icon.png`).

> **Ícono:** el ícono de la app es `icon.png` en la raíz del proyecto. Reemplazá ese
> archivo por el tuyo (idealmente PNG cuadrado 512×512) y quedará como ícono al
> instalar la PWA. Ya viene un placeholder.

---

## 1. Configurar Firebase

1. Entrá a <https://console.firebase.google.com> y creá un proyecto.
2. En **Compilación → Realtime Database → Crear base de datos** (elegí una región y
   empezá en modo bloqueado).
3. En **⚙ Configuración del proyecto → Tus apps**, agregá una **app web** (`</>`) y
   copiá el objeto `firebaseConfig`.
4. Pegá ese objeto en **`firebase-config.js`** (reemplazando los `PEGAR_AQUI`).
   Asegurate de que incluya `databaseURL`.

### Reglas de la Realtime Database
Como no hay login, para uso privado entre dos personas se puede dejar abierto, pero
conviene al menos limitar la estructura. En **Realtime Database → Reglas**, pegá:

```json
{
  "rules": {
    "users":    { ".read": true, ".write": true },
    "events":   { ".read": true, ".write": true },
    "messages": { ".read": true, ".write": true }
  }
}
```

> ⚠️ Estas reglas son **públicas**: cualquiera con la URL puede leer/escribir. Sirve
> para uso personal. Si querés más seguridad, activá Firebase Authentication (anónima)
> y restringí `.read`/`.write` a `auth != null`.

---

## 2. Probar en local

Necesitás servir los archivos por HTTP (el Service Worker no funciona con `file://`):

```bash
# opción 1 (Node)
npx serve .

# opción 2 (Python)
python -m http.server 8080
```

Abrí la URL que te muestre (ej: `http://localhost:8080`). Para probar en el celular en
la misma red, usá la IP de la PC (ej: `http://192.168.0.10:8080`).

> Las notificaciones y la instalación como PWA requieren **HTTPS** (o `localhost`).
> Al desplegar usá un hosting con HTTPS (ver abajo).

---

## 3. Desplegar (recomendado: Firebase Hosting)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # public dir = . (o mové los archivos a /public)
firebase deploy
```

También sirve cualquier hosting estático con HTTPS: **Netlify**, **Vercel**,
**GitHub Pages**, etc. Simplemente subí todos los archivos de esta carpeta.

---

## 4. Instalar como app en el celular

Requisitos: servida por **HTTPS** (no sirve `file://` ni `http://IP` local).

- **Android (Chrome):** cuando la app es instalable aparece un botón
  **"📲 Instalar AgendaFamiliar"** dentro de la app. También podés usar el menú ⋮ →
  *Instalar app* / *Agregar a pantalla de inicio*.
- **iOS (Safari):** en iOS **no hay botón automático**: botón *Compartir* →
  *Agregar a pantalla de inicio*.

> **Importante — el ícono `icon.png` debe ser un PNG cuadrado de 512×512.** Si usás otro
> tamaño, Chrome puede rechazar la instalación por no coincidir con lo declarado en el
> manifest.
>
> **Tras redeployar:** como la app cachea recursos con un Service Worker, al actualizar
> puede hacer falta abrir/recargar 1–2 veces para que tome la versión nueva.

---

## Notificaciones

Son **notificaciones locales**. Un "ticker" revisa cada 30 segundos los eventos de hoy
y dispara el aviso cuando llega la hora (con 2 min de margen por si la pestaña estuvo
suspendida). No repite un aviso ya mostrado (anti-duplicados guardado en `localStorage`).

**Cómo activarlas:**
1. Instalá la app como PWA (recomendado) y abrila.
2. Tocá el botón **"🔔 Activar recordatorios"** (aparece arriba si el permiso no fue
   decidido) o simplemente creá una actividad: la app pedirá permiso de notificaciones.
3. Aceptá el permiso. Verás una notificación de confirmación.

**Limitaciones (por eso "locales"):**
- Solo se disparan si la app/PWA está **abierta o activa en segundo plano**. Si el
  sistema la cierra por completo, ningún JS corre y el aviso no salta a esa hora.
- Andan mejor con la app **instalada** que en una pestaña del navegador.
- En **iOS** el permiso de notificaciones web requiere **iOS 16.4+** y la app
  **instalada** en la pantalla de inicio.

Para avisos 100 % confiables con la app **totalmente cerrada** hace falta **FCM
(push real)** + una Cloud Function programada (requiere plan Blaze). El código ya está
preparado; ver abajo.

### Activar FCM push real (opcional, más adelante)
Todo el código ya está preparado. Pasos:

1. En Firebase → **Cloud Messaging**, generá la **clave web push (VAPID)** y pegala en
   `firebase-config.js` → `FCM_VAPID_KEY`.
2. En `index.html`, agregá el SDK de messaging después de los otros:
   ```html
   <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"></script>
   ```
3. Creá `firebase-messaging-sw.js` en la raíz (SW dedicado de FCM).
4. Descomentá el cuerpo de `initFCM()` en `notifications.js`.
5. El token se guarda en `users/{nombre}/fcmToken`.
6. Creá una **Cloud Function programada** (Blaze) que recorra `events` y envíe el push
   al token del destinatario a la hora del evento.

---

## Estructura de datos (Realtime Database)

```
users/{Vani|Ale}   -> { name, lastSeen, fcmToken? }
events/{id}        -> { desc, time:"HH:MM", forWho, createdBy,
                        type:"once"|"weekly",
                        date:"YYYY-MM-DD" | null,   // si once
                        weekday:0-6 | null,         // si weekly (0=Dom)
                        createdAt }
messages/{id}      -> { from, text, ts }
```

## Archivos

| Archivo | Rol |
|---|---|
| `index.html` | Estructura de la app |
| `styles.css` | Estilos (mobile-first) |
| `app.js` | Lógica: usuarios, eventos, chat, navegación |
| `notifications.js` | Notificaciones locales + stub FCM |
| `firebase-config.js` | **Tus credenciales de Firebase** |
| `sw.js` | Service Worker (offline + notificaciones) |
| `manifest.json` | Metadatos PWA |
| `icon.png` | **Ícono de la app** (reemplazá por el tuyo) |
