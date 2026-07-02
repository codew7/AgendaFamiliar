/* ==================================================================
 *  app.js — Agenda compartida Vani & Ale
 * ================================================================== */

(() => {
  "use strict";

  const USERS = ["Vani", "Ale"];
  const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const LS_USER = "agenda.user";
  const LS_LASTREAD = "agenda.lastReadTs";
  const LS_THEME = "agenda.theme";

  // ---- Estado ----
  let db = null;
  let currentUser = null;
  let selectedDate = startOfDay(new Date());
  let events = [];   // [{id, ...}]
  let messages = []; // [{id, from, text, ts}]
  let firebaseReady = false;

  // ---- Utilidades de fecha ----
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function isoDate(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function sameDay(a, b) { return isoDate(a) === isoDate(b); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---- Referencias al DOM ----
  const $ = (sel) => document.querySelector(sel);
  const el = {
    onboarding: $("#onboarding"),
    app: $("#app"),
    userName: $("#current-user-name"),
    switchUser: $("#switch-user"),
    themeToggle: $("#theme-toggle"),
    themeColorMeta: $("#theme-color-meta"),
    prevDay: $("#prev-day"),
    nextDay: $("#next-day"),
    todayBtn: $("#today-btn"),
    dateWeekday: $("#date-weekday"),
    dateFull: $("#date-full"),
    eventsList: $("#events-list"),
    eventsEmpty: $("#events-empty"),
    fabAdd: $("#fab-add"),
    // modal
    modal: $("#event-modal"),
    modalTitle: $("#modal-title"),
    form: $("#event-form"),
    fId: $("#event-id"),
    fDesc: $("#f-desc"),
    fDate: $("#f-date"),
    fTime: $("#f-time"),
    fFor: $("#f-for"),
    deleteBtn: $("#delete-event"),
    // mensajes
    viewAgenda: $("#view-agenda"),
    viewMessages: $("#view-messages"),
    messagesList: $("#messages-list"),
    chatScroll: $("#chat-scroll"),
    chatForm: $("#chat-form"),
    chatInput: $("#chat-input"),
    msgBadge: $("#msg-badge"),
    navItems: document.querySelectorAll(".nav-item"),
    configWarning: $("#config-warning"),
    toast: $("#toast"),
  };

  // ==================================================================
  //  Inicialización de Firebase
  // ==================================================================
  function initFirebase() {
    const cfg = window.__FIREBASE_CONFIG__ || {};
    const notConfigured = !cfg.apiKey || String(cfg.apiKey).includes("PEGAR_AQUI");
    if (notConfigured || !cfg.databaseURL || cfg.databaseURL.includes("PEGAR_AQUI")) {
      el.configWarning.classList.remove("hidden");
      return false;
    }
    try {
      firebase.initializeApp(cfg);
      db = firebase.database();
      firebaseReady = true;
      return true;
    } catch (e) {
      console.error("Error inicializando Firebase:", e);
      el.configWarning.classList.remove("hidden");
      return false;
    }
  }

  // ==================================================================
  //  Identidad de usuario
  // ==================================================================
  function loadUser() {
    currentUser = localStorage.getItem(LS_USER);
    if (currentUser && USERS.includes(currentUser)) {
      enterApp();
    } else {
      showOnboarding();
    }
  }

  function showOnboarding() {
    el.onboarding.classList.remove("hidden");
    el.app.classList.add("hidden");
    document.querySelectorAll(".user-btn").forEach((btn) => {
      btn.onclick = () => setUser(btn.dataset.user);
    });
  }

  function setUser(name) {
    if (!USERS.includes(name)) return;
    currentUser = name;
    localStorage.setItem(LS_USER, name);
    if (firebaseReady) {
      db.ref(`users/${name}`).update({ name, lastSeen: Date.now() });
    }
    enterApp();
  }

  function enterApp() {
    el.onboarding.classList.add("hidden");
    el.app.classList.remove("hidden");
    el.userName.textContent = currentUser;
    if (firebaseReady) {
      db.ref(`users/${currentUser}`).update({ name: currentUser, lastSeen: Date.now() });
      attachListeners();
      Notifications.initFCM(firebase, db, currentUser);
    }
    renderDate();
    renderEvents();
  }

  // ==================================================================
  //  Listeners de Realtime Database
  // ==================================================================
  function attachListeners() {
    db.ref("events").on("value", (snap) => {
      const val = snap.val() || {};
      events = Object.entries(val).map(([id, e]) => ({ id, ...e }));
      renderEvents();
      scheduleTodayNotifications();
    });

    db.ref("messages").on("value", (snap) => {
      const val = snap.val() || {};
      messages = Object.entries(val)
        .map(([id, m]) => ({ id, ...m }))
        .sort((a, b) => (a.ts || 0) - (b.ts || 0));
      renderMessages();
      updateBadge();
    });
  }

  // ==================================================================
  //  Navegación por días + render de eventos
  // ==================================================================
  function renderDate() {
    const wd = WEEKDAYS[selectedDate.getDay()];
    el.dateWeekday.textContent = cap(wd);
    el.dateFull.textContent = selectedDate.toLocaleDateString("es-AR", {
      day: "numeric", month: "long", year: "numeric",
    });
    el.todayBtn.classList.toggle("is-today", sameDay(selectedDate, new Date()));
  }

  function eventsForSelectedDate() {
    const iso = isoDate(selectedDate);
    const wd = selectedDate.getDay();
    return events
      .filter((e) =>
        (e.type === "weekly" && Number(e.weekday) === wd) ||
        (e.type !== "weekly" && e.date === iso)
      )
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }

  function renderEvents() {
    const list = eventsForSelectedDate();
    el.eventsList.innerHTML = "";
    if (list.length === 0) {
      el.eventsEmpty.classList.remove("hidden");
      return;
    }
    el.eventsEmpty.classList.add("hidden");

    for (const ev of list) {
      const li = document.createElement("li");
      li.className = "event-card";
      li.innerHTML = `
        <div class="event-time"><strong>${escapeHtml(ev.time || "--:--")}</strong></div>
        <div class="event-body">
          <span class="event-desc">${escapeHtml(ev.desc || "")}</span>
          <span class="event-for ${ev.forWho === "Vani" ? "for-vani" : "for-ale"}">
            para ${escapeHtml(ev.forWho || "")}${ev.type === "weekly" ? " · cada semana" : ""}
          </span>
        </div>`;
      li.onclick = () => openModal(ev);
      el.eventsList.appendChild(li);
    }
  }

  function changeDay(delta) {
    selectedDate = startOfDay(new Date(selectedDate.getTime() + delta * 864e5));
    renderDate();
    renderEvents();
  }

  // ==================================================================
  //  Modal de creación / edición
  // ==================================================================
  let modalForWho = null;

  function openModal(ev) {
    el.modal.classList.remove("hidden");
    if (ev) {
      el.modalTitle.textContent = "Editar actividad";
      el.fId.value = ev.id;
      el.fDesc.value = ev.desc || "";
      el.fTime.value = ev.time || "";
      el.fDate.value = ev.type === "weekly" ? isoDate(nextWeekdayDate(ev.weekday)) : (ev.date || isoDate(selectedDate));
      setModalFor(ev.forWho || currentUser);
      setRepeat(ev.type === "weekly");
      el.deleteBtn.classList.remove("hidden");
    } else {
      el.modalTitle.textContent = "Nueva actividad";
      el.form.reset();
      el.fId.value = "";
      el.fDate.value = isoDate(selectedDate);
      setModalFor(currentUser);
      setRepeat(false);
      el.deleteBtn.classList.add("hidden");
    }
    setTimeout(() => el.fDesc.focus(), 150);
  }

  function closeModal() {
    el.modal.classList.add("hidden");
  }

  function setModalFor(name) {
    modalForWho = name;
    el.fFor.querySelectorAll(".seg").forEach((b) =>
      b.classList.toggle("active", b.dataset.for === name)
    );
  }

  let modalRepeat = false;
  function setRepeat(on) {
    modalRepeat = on;
    const btn = $("#f-repeat");
    if (btn) {
      btn.classList.toggle("active", on);
      btn.textContent = on ? "On" : "Off";
    }
  }

  function nextWeekdayDate(weekday) {
    const d = startOfDay(new Date());
    const diff = (Number(weekday) - d.getDay() + 7) % 7;
    return new Date(d.getTime() + diff * 864e5);
  }

  async function saveEvent(e) {
    e.preventDefault();
    if (!firebaseReady) { toast("Configurá Firebase primero"); return; }

    const desc = el.fDesc.value.trim();
    const time = el.fTime.value;
    const dateVal = el.fDate.value;
    if (!desc || !time || !dateVal || !modalForWho) {
      toast("Completá todos los campos");
      return;
    }

    const dateObj = new Date(dateVal + "T00:00:00");
    const payload = {
      desc,
      time,
      forWho: modalForWho,
      createdBy: currentUser,
      type: modalRepeat ? "weekly" : "once",
      createdAt: Date.now(),
    };
    if (modalRepeat) {
      payload.weekday = dateObj.getDay();
      payload.date = null;
    } else {
      payload.date = dateVal;
      payload.weekday = null;
    }

    try {
      const id = el.fId.value;
      if (id) {
        await db.ref(`events/${id}`).update(payload);
        toast("Actividad actualizada");
      } else {
        await db.ref("events").push(payload);
        toast("Actividad agregada");
      }
      closeModal();
    } catch (err) {
      console.error(err);
      toast("No se pudo guardar");
    }
  }

  async function deleteEvent() {
    const id = el.fId.value;
    if (!id || !firebaseReady) return;
    try {
      await db.ref(`events/${id}`).remove();
      toast("Actividad eliminada");
      closeModal();
    } catch (err) {
      console.error(err);
      toast("No se pudo eliminar");
    }
  }

  // ==================================================================
  //  Mensajería
  // ==================================================================
  function renderMessages() {
    el.messagesList.innerHTML = "";
    let lastDay = null;
    for (const m of messages) {
      const dayKey = isoDate(new Date(m.ts || Date.now()));
      if (dayKey !== lastDay) {
        lastDay = dayKey;
        const sep = document.createElement("li");
        sep.className = "msg-day-sep";
        sep.textContent = dayLabel(new Date(m.ts || Date.now()));
        el.messagesList.appendChild(sep);
      }
      const li = document.createElement("li");
      const mine = m.from === currentUser;
      li.className = `msg ${mine ? "mine" : "theirs"}`;
      const t = new Date(m.ts || Date.now());
      li.innerHTML = `${escapeHtml(m.text || "")}<span class="msg-meta">${mine ? "" : escapeHtml(m.from) + " · "}${pad(t.getHours())}:${pad(t.getMinutes())}</span>`;
      el.messagesList.appendChild(li);
    }
    if (isMessagesView()) {
      el.chatScroll.scrollTop = el.chatScroll.scrollHeight;
    }
  }

  function dayLabel(d) {
    const today = new Date();
    if (sameDay(d, today)) return "Hoy";
    if (sameDay(d, new Date(today.getTime() - 864e5))) return "Ayer";
    return cap(d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }));
  }

  async function sendMessage(e) {
    e.preventDefault();
    const text = el.chatInput.value.trim();
    if (!text || !firebaseReady) return;
    el.chatInput.value = "";
    try {
      await db.ref("messages").push({ from: currentUser, text, ts: Date.now() });
    } catch (err) {
      console.error(err);
      toast("No se pudo enviar");
    }
  }

  function updateBadge() {
    if (isMessagesView()) { markRead(); return; }
    const lastRead = Number(localStorage.getItem(LS_LASTREAD) || 0);
    const unread = messages.filter((m) => m.from !== currentUser && (m.ts || 0) > lastRead).length;
    if (unread > 0) {
      el.msgBadge.textContent = unread > 9 ? "9+" : String(unread);
      el.msgBadge.classList.remove("hidden");
    } else {
      el.msgBadge.classList.add("hidden");
    }
  }

  function markRead() {
    const last = messages.length ? (messages[messages.length - 1].ts || Date.now()) : Date.now();
    localStorage.setItem(LS_LASTREAD, String(last));
    el.msgBadge.classList.add("hidden");
  }

  function isMessagesView() { return !el.viewMessages.classList.contains("hidden"); }

  // ==================================================================
  //  Navegación entre vistas
  // ==================================================================
  function switchView(view) {
    const isMsg = view === "messages";
    el.viewAgenda.classList.toggle("hidden", isMsg);
    el.viewMessages.classList.toggle("hidden", !isMsg);
    el.navItems.forEach((n) => n.classList.toggle("active", n.dataset.view === view));
    if (isMsg) {
      renderMessages();
      markRead();
    }
  }

  // ==================================================================
  //  Notificaciones
  // ==================================================================
  async function scheduleTodayNotifications() {
    if (!Notifications.supported()) return;
    if (Notification.permission !== "granted") return;
    // Eventos de HOY (puntuales o recurrentes que caen hoy)
    const today = new Date();
    const iso = isoDate(today);
    const wd = today.getDay();
    const todays = events.filter((e) =>
      (e.type === "weekly" && Number(e.weekday) === wd) ||
      (e.type !== "weekly" && e.date === iso)
    );
    Notifications.scheduleForDay(todays, currentUser);
  }

  async function ensureNotificationPermission() {
    const res = await Notifications.requestPermission();
    if (res === "granted") {
      scheduleTodayNotifications();
    }
  }

  // ==================================================================
  //  Helpers UI
  // ==================================================================
  // ---- Tema (modo nocturno) ----
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(LS_THEME, theme);
    if (el.themeToggle) el.themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    if (el.themeColorMeta) el.themeColorMeta.setAttribute("content", theme === "dark" ? "#0b1120" : "#0f172a");
  }
  function toggleTheme() {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
  }

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2200);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // ==================================================================
  //  Wiring de eventos del DOM
  // ==================================================================
  function bindUI() {
    el.prevDay.onclick = () => changeDay(-1);
    el.nextDay.onclick = () => changeDay(1);
    el.todayBtn.onclick = () => { selectedDate = startOfDay(new Date()); renderDate(); renderEvents(); };

    el.fabAdd.onclick = () => { openModal(null); ensureNotificationPermission(); };
    el.switchUser.onclick = () => {
      localStorage.removeItem(LS_USER);
      showOnboarding();
    };
    el.themeToggle.onclick = toggleTheme;

    // Modal
    el.form.onsubmit = saveEvent;
    el.deleteBtn.onclick = deleteEvent;
    el.modal.querySelectorAll("[data-close]").forEach((n) => (n.onclick = closeModal));
    el.fFor.querySelectorAll(".seg").forEach((b) => (b.onclick = () => setModalFor(b.dataset.for)));

    // Toggle "repetir cada semana"
    $("#f-repeat").onclick = () => setRepeat(!modalRepeat);

    // Mensajería
    el.chatForm.onsubmit = sendMessage;

    // Nav
    el.navItems.forEach((n) => (n.onclick = () => switchView(n.dataset.view)));

    // Reprogramar notificaciones al volver a foco
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scheduleTodayNotifications();
    });
  }

  // ==================================================================
  //  Service Worker (PWA)
  // ==================================================================
  function registerSW() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch((e) =>
        console.warn("SW no registrado:", e)
      );
    }
  }

  // ==================================================================
  //  Arranque
  // ==================================================================
  function main() {
    applyTheme(localStorage.getItem(LS_THEME) === "dark" ? "dark" : "light");
    bindUI();
    registerSW();
    initFirebase();
    loadUser();
  }

  document.addEventListener("DOMContentLoaded", main);
})();
