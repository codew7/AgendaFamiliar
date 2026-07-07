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

Para avisos 100 % confiables con la app **totalmente cerrada** está el **push real con
FCM** (ver abajo). Las locales quedan igual como respaldo cuando la app está abierta.

---

## 6. Notificaciones push reales (FCM) — con la app cerrada

Ya está **todo el código implementado** (cliente + servidor). Componentes:
- `firebase-messaging-sw.js` — recibe el push en segundo plano.
- `initFCM()` en `notifications.js` — registra el token de cada dispositivo en
  `users/{nombre}/tokens/{token}`.
- `functions/index.js` — Cloud Function programada que corre **cada minuto**, revisa los
  eventos cuya hora coincide (en horario de **Argentina**) y envía el push al destinatario.

### Requisito: plan Blaze
Cloud Functions + Cloud Scheduler necesitan el **plan Blaze** (pago por uso). Para 2
usuarios el consumo entra en la **capa gratuita** → costo prácticamente **$0**, pero
Firebase pide una tarjeta igual. Activalo en: consola → ⚙ → *Uso y facturación* → *Blaze*.

### Pasos para activarlo
1. **VAPID key:** consola de Firebase → ⚙ *Configuración del proyecto* → **Cloud
   Messaging** → *Certificados push web* → **Generar par de claves** → copiá la clave y
   pegala en `firebase-config.js` → `FCM_VAPID_KEY`.
2. **Instalá dependencias de las functions** (una sola vez):
   ```bash
   cd functions && npm install && cd ..
   ```
3. **Desplegá** reglas de la base, hosting y la función:
   ```bash
   firebase deploy
   ```
   La primera vez, el CLI te pedirá **habilitar APIs** (Cloud Functions, Cloud Scheduler,
   Cloud Build, Artifact Registry) — aceptá.
4. En el celu, abrí la app **instalada**, tocá **"🔔 Activar recordatorios"** y **aceptá**
   el permiso. Eso registra el token de push de ese dispositivo.
5. Listo. Creá un evento a 1–2 minutos para probar y **cerrá la app**: debería llegar la
   notificación igual.

### Notas
- La función usa la zona horaria `America/Argentina/Buenos_Aires` (editable en
  `functions/index.js`, constante `TZ`).
- Cada dispositivo guarda su propio token; si instalás la app en varios, llegan a todos.
- **iOS:** el push web funciona solo en **iOS 16.4+** y con la app **instalada** en la
  pantalla de inicio.
- Los tokens inválidos se limpian solos cuando la función detecta que ya no aplican.

---

## Estructura de datos (Realtime Database)

```
users/{Vani|Ale}     -> { name, lastSeen, tokens: { <fcmToken>: ts } }
events/{id}          -> { desc, time:"HH:MM", forWho:"Vani|Ale|"",  // "" = para los dos
                          createdBy,
                          type:"once"|"weekly",
                          date:"YYYY-MM-DD" | null,   // si once
                          weekday:0-6 | null,         // si weekly (0=Dom)
                          createdAt }
messages/{id}        -> { from, text, ts }
notified/{date}/{id} -> true   // interno: anti-duplicados del push (lo maneja la función)
```

## Archivos

| Archivo | Rol |
|---|---|
| `index.html` | Estructura de la app |
| `styles.css` | Estilos (mobile-first) |
| `app.js` | Lógica: usuarios, eventos, chat, navegación |
| `notifications.js` | Notificaciones locales + FCM (token, primer plano) |
| `firebase-config.js` | **Tus credenciales de Firebase** + VAPID key |
| `sw.js` | Service Worker (offline + notificaciones) |
| `firebase-messaging-sw.js` | Service Worker de FCM (push en segundo plano) |
| `manifest.json` | Metadatos PWA |
| `icon.png` | **Ícono de la app** (reemplazá por el tuyo) |
| `functions/index.js` | Cloud Function: envía los push a la hora del evento |
| `firebase.json` / `.firebaserc` | Config de deploy (hosting + functions + reglas) |
| `database.rules.json` | Reglas de la Realtime Database |
