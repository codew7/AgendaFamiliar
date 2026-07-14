/* ==================================================================
 *  app.js — Agenda compartida Vanina & Alejandro
 * ================================================================== */

(() => {
  "use strict";

  const USERS = ["Vanina", "Alejandro"];
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

  // Listas tipo ToDo (Compras y Pendientes): mismo componente, distinto nodo.
  const LIST_KEYS = ["shopping", "todos"];
  const DONE_TTL = 864e5; // los ítems tildados se borran solos a las 24 hs
  const lists = { shopping: [], todos: [] }; // [{id, text, done, doneAt, order}]

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
    installBtn: $("#install-btn"),
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
    fHour: $("#f-hour"),
    fMin: $("#f-min"),
    fFor: $("#f-for"),
    deleteBtn: $("#delete-event"),
    // vistas
    viewAgenda: $("#view-agenda"),
    viewShopping: $("#view-shopping"),
    viewTodos: $("#view-todos"),
    viewMessages: $("#view-messages"),
    // mensajes
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
    });

    db.ref("messages").on("value", (snap) => {
      const val = snap.val() || {};
      messages = Object.entries(val)
        .map(([id, m]) => ({ id, ...m }))
        .sort((a, b) => (a.ts || 0) - (b.ts || 0));
      renderMessages();
      updateBadge();
    });

    for (const key of LIST_KEYS) {
      db.ref(key).on("value", (snap) => {
        const val = snap.val() || {};
        lists[key] = Object.entries(val).map(([id, it]) => ({ id, ...it }));
        purgeOldDone(key);
        renderList(key);
      });
    }
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
      const who = ev.forWho || "";
      const forClass = who === "Vanina" ? "for-vani" : who === "Alejandro" ? "for-ale" : "for-both";
      const parts = [];
      if (who) parts.push(`para ${escapeHtml(who)}`);
      if (ev.type === "weekly") parts.push("cada semana");
      const forLabel = parts.join(" · ");
      const li = document.createElement("li");
      li.className = "event-card";
      li.innerHTML = `
        <div class="event-time"><strong>${escapeHtml(ev.time || "--:--")}</strong></div>
        <div class="event-body">
          <span class="event-desc">${escapeHtml(ev.desc || "")}</span>
          ${forLabel ? `<span class="event-for ${forClass}">${forLabel}</span>` : ""}
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

  // Llena los desplegables de hora (00–23) y minutos (00,05,…,55), 24 hs.
  function populateTimeSelects() {
    el.fHour.innerHTML = "";
    for (let h = 0; h < 24; h++) {
      const o = document.createElement("option");
      o.value = pad(h);
      o.textContent = pad(h);
      el.fHour.appendChild(o);
    }
    el.fMin.innerHTML = "";
    for (let m = 0; m < 60; m += 5) {
      const o = document.createElement("option");
      o.value = pad(m);
      o.textContent = pad(m);
      el.fMin.appendChild(o);
    }
  }

  // Agrega una opción puntual si no existe (para minutos no múltiplos de 5 al editar).
  function ensureOption(select, val) {
    if (![...select.options].some((o) => o.value === val)) {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = val;
      select.appendChild(o);
    }
  }

  // Fija la hora en los desplegables. Sin valor: hora actual (min a múltiplo de 5).
  function setModalTime(hhmm) {
    let h, m;
    if (hhmm && /^\d{1,2}:\d{2}$/.test(hhmm)) {
      [h, m] = hhmm.split(":").map(Number);
    } else {
      const now = new Date();
      h = now.getHours();
      m = Math.round(now.getMinutes() / 5) * 5;
      if (m === 60) { m = 0; h = (h + 1) % 24; }
    }
    ensureOption(el.fMin, pad(m));
    el.fHour.value = pad(h);
    el.fMin.value = pad(m);
  }

  function openModal(ev) {
    el.modal.classList.remove("hidden");
    if (ev) {
      el.modalTitle.textContent = "Editar actividad";
      el.fId.value = ev.id;
      el.fDesc.value = ev.desc || "";
      setModalTime(ev.time);
      el.fDate.value = ev.type === "weekly" ? isoDate(nextWeekdayDate(ev.weekday)) : (ev.date || isoDate(selectedDate));
      setModalFor(ev.forWho || "");
      setRepeat(ev.type === "weekly");
      el.deleteBtn.classList.remove("hidden");
    } else {
      el.modalTitle.textContent = "Nueva actividad";
      el.form.reset();
      el.fId.value = "";
      el.fDate.value = isoDate(selectedDate);
      setModalTime(null);
      setModalFor("");
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
    const time = el.fHour.value && el.fMin.value ? `${el.fHour.value}:${el.fMin.value}` : "";
    const dateVal = el.fDate.value;
    // "Para quién" es opcional: vacío ("") significa que es para los dos.
    if (!desc || !time || !dateVal) {
      toast("Completá la actividad, el día y la hora");
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
  //  Listas tipo ToDo (Compras y Pendientes)
  //  Un solo componente para las dos: cambia el nodo de Firebase (`key`).
  // ==================================================================
  const listCache = {};
  function listEls(key) {
    if (!listCache[key]) {
      const view = key === "shopping" ? el.viewShopping : el.viewTodos;
      listCache[key] = {
        view,
        scroll: view.querySelector(".list-scroll"),
        pending: $(`#${key}-pending`),
        done: $(`#${key}-done`),
        sep: $(`#${key}-sep`),
        empty: $(`#${key}-empty`),
        form: $(`#${key}-form`),
      };
    }
    return listCache[key];
  }

  // Un ítem tildado hace más de 24 hs ya no se muestra, aunque el borrado
  // en el servidor todavía no haya ocurrido.
  function isExpired(it) {
    return !!it.done && !!it.doneAt && Date.now() - it.doneAt > DONE_TTL;
  }

  // Borra del servidor los tildados que superaron las 24 hs.
  function purgeOldDone(key) {
    if (!firebaseReady) return;
    const old = lists[key].filter(isExpired);
    for (const it of old) {
      db.ref(`${key}/${it.id}`).remove().catch((e) => console.warn("No se pudo purgar:", e));
    }
  }

  function renderList(key) {
    const els = listEls(key);
    const visible = lists[key].filter((it) => !isExpired(it));
    const pending = visible
      .filter((it) => !it.done)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const done = visible
      .filter((it) => it.done)
      .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

    els.pending.innerHTML = "";
    els.done.innerHTML = "";
    for (const it of pending) els.pending.appendChild(itemNode(key, it));
    for (const it of done) els.done.appendChild(itemNode(key, it));

    els.sep.classList.toggle("hidden", done.length === 0);
    els.empty.classList.toggle("hidden", visible.length > 0);
  }

  function itemNode(key, it) {
    const li = document.createElement("li");
    li.className = `list-item${it.done ? " is-done" : ""}`;
    li.dataset.id = it.id;
    li.innerHTML = `
      <span class="list-drag" aria-hidden="true">⠿</span>
      <label class="list-check-wrap">
        <input type="checkbox" class="list-check" ${it.done ? "checked" : ""} aria-label="Marcar como hecho" />
      </label>
      <span class="list-text">${escapeHtml(it.text || "")}</span>
      <button type="button" class="list-del" aria-label="Eliminar">🗑</button>`;

    li.querySelector(".list-check").onchange = () => toggleItem(key, it);
    li.querySelector(".list-del").onclick = () => removeItem(key, it.id);
    if (!it.done) {
      li.querySelector(".list-drag").addEventListener("pointerdown", (e) => startDrag(e, key, li));
    }
    return li;
  }

  async function addItem(key, text) {
    if (!firebaseReady) { toast("Configurá Firebase primero"); return; }
    const orders = lists[key].filter((it) => !it.done).map((it) => it.order || 0);
    const order = orders.length ? Math.max(...orders) + 1 : 0;
    try {
      await db.ref(key).push({
        text,
        done: false,
        doneAt: null,
        order,
        createdBy: currentUser,
        createdAt: Date.now(),
      });
    } catch (err) {
      console.error(err);
      toast("No se pudo agregar");
    }
  }

  async function toggleItem(key, it) {
    if (!firebaseReady) return;
    try {
      await db.ref(`${key}/${it.id}`).update({
        done: !it.done,
        doneAt: it.done ? null : Date.now(),
      });
    } catch (err) {
      console.error(err);
      toast("No se pudo actualizar");
      renderList(key); // el checkbox ya cambió en pantalla: lo devolvemos a su estado real
    }
  }

  async function removeItem(key, id) {
    if (!firebaseReady) return;
    try {
      await db.ref(`${key}/${id}`).remove();
    } catch (err) {
      console.error(err);
      toast("No se pudo eliminar");
    }
  }

  // ---- Reorden manual por arrastre (mouse y dedo, vía Pointer Events) ----
  let drag = null; // { key, li, ul, startY, lastY, raf }

  // Los listeners van en `window` a propósito: al reordenar movemos el <li> con
  // insertBefore, y eso libera la captura del puntero sobre la manija (se pierde
  // el pointerup y el arrastre queda colgado). `window` no se ve afectado.
  function startDrag(e, key, li) {
    if (drag) return;
    e.preventDefault();
    const ul = li.parentElement;
    drag = { key, li, ul, startY: e.clientY, lastY: e.clientY, raf: null };
    li.classList.add("dragging");
    window.addEventListener("pointermove", onDragMove, { passive: false });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    drag.raf = requestAnimationFrame(autoScrollTick);
  }

  function onDragMove(e) {
    if (!drag) return;
    e.preventDefault();
    drag.lastY = e.clientY;
    applyDrag();
  }

  function applyDrag() {
    const { li, ul, startY, lastY } = drag;
    li.style.transform = `translateY(${lastY - startY}px)`;

    // Punto de inserción: antes del primer hermano cuyo centro quede por
    // debajo del centro de la fila que estamos arrastrando.
    const r = li.getBoundingClientRect();
    const center = r.top + r.height / 2;
    let ref = null;
    for (const n of ul.children) {
      if (n === li) continue;
      const nr = n.getBoundingClientRect();
      if (center < nr.top + nr.height / 2) { ref = n; break; }
    }
    if (ref === li.nextElementSibling) return; // ya está en su lugar

    // Al mover el nodo cambia su posición de layout; corregimos la referencia
    // para que la fila no pegue un salto bajo el dedo.
    const before = li.getBoundingClientRect().top;
    ul.insertBefore(li, ref);
    const after = li.getBoundingClientRect().top;
    drag.startY += after - before;
    li.style.transform = `translateY(${drag.lastY - drag.startY}px)`;
  }

  // Acerca la fila al borde del área scrolleable y la lista se desplaza sola.
  function autoScrollTick() {
    if (!drag) return;
    const sc = listEls(drag.key).scroll;
    const r = sc.getBoundingClientRect();
    const EDGE = 56;
    let dv = 0;
    if (drag.lastY < r.top + EDGE) dv = -10 * ((r.top + EDGE - drag.lastY) / EDGE);
    else if (drag.lastY > r.bottom - EDGE) dv = 10 * ((drag.lastY - (r.bottom - EDGE)) / EDGE);

    if (dv) {
      const prev = sc.scrollTop;
      sc.scrollTop += dv;
      const moved = sc.scrollTop - prev;
      if (moved) {
        drag.startY -= moved; // la fila sigue pegada al dedo mientras la lista se desplaza
        applyDrag();
      }
    }
    drag.raf = requestAnimationFrame(autoScrollTick);
  }

  function endDrag() {
    if (!drag) return;
    const { key, li, ul, raf } = drag;
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    li.style.transform = "";
    li.classList.remove("dragging");
    drag = null;
    persistOrder(key, ul);
  }

  // Reescribe el `order` de los pendientes según cómo quedaron en pantalla,
  // en una única escritura multi-path (atómica).
  function persistOrder(key, ul) {
    if (!firebaseReady) return;
    const updates = {};
    [...ul.children].forEach((n, i) => { updates[`${n.dataset.id}/order`] = i; });
    if (!Object.keys(updates).length) return;
    db.ref(key).update(updates).catch((err) => {
      console.error(err);
      toast("No se pudo guardar el orden");
      renderList(key);
    });
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
    const views = {
      agenda: el.viewAgenda,
      shopping: el.viewShopping,
      todos: el.viewTodos,
      messages: el.viewMessages,
    };
    Object.entries(views).forEach(([name, node]) => node.classList.toggle("hidden", name !== view));
    el.navItems.forEach((n) => n.classList.toggle("active", n.dataset.view === view));
    if (view === "messages") {
      renderMessages();
      markRead();
    }
  }

  // ==================================================================
  //  Vaciar una sección (3 toques seguidos en su pestaña + contraseña)
  // ==================================================================
  const WIPE_PASS = "47623212";
  const WIPE_TAPS = 3;
  const WIPE_WINDOW = 700; // ms entre toque y toque
  const WIPE_TARGET = {
    agenda:   { node: "events",   label: "la Agenda" },
    shopping: { node: "shopping", label: "Compras" },
    todos:    { node: "todos",    label: "Pendientes" },
    messages: { node: "messages", label: "Mensajes" },
  };

  let tapView = null;
  let tapCount = 0;
  let tapTimer = null;
  let wipeView = null;

  function registerTap(view) {
    if (view !== tapView) { tapView = view; tapCount = 0; }
    tapCount++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { tapCount = 0; tapView = null; }, WIPE_WINDOW);
    if (tapCount >= WIPE_TAPS) {
      clearTimeout(tapTimer);
      tapCount = 0;
      tapView = null;
      openWipeModal(view);
    }
  }

  function openWipeModal(view) {
    if (!WIPE_TARGET[view]) return;
    wipeView = view;
    $("#wipe-section").textContent = WIPE_TARGET[view].label;
    $("#wipe-pass").value = "";
    $("#wipe-error").classList.add("hidden");
    $("#wipe-modal").classList.remove("hidden");
    setTimeout(() => $("#wipe-pass").focus(), 150);
  }

  function closeWipeModal() {
    $("#wipe-modal").classList.add("hidden");
    wipeView = null;
  }

  async function confirmWipe(e) {
    e.preventDefault();
    const sheet = $("#wipe-modal .modal-sheet");
    if ($("#wipe-pass").value !== WIPE_PASS) {
      $("#wipe-error").classList.remove("hidden");
      $("#wipe-pass").value = "";
      sheet.classList.remove("shake");
      void sheet.offsetWidth; // reinicia la animación
      sheet.classList.add("shake");
      return;
    }
    if (!firebaseReady || !wipeView) return;
    const { node, label } = WIPE_TARGET[wipeView];
    try {
      await db.ref(node).remove();
      closeWipeModal();
      toast(`Se vació ${label}`);
    } catch (err) {
      console.error(err);
      toast("No se pudo borrar");
    }
  }

  // ==================================================================
  //  Helpers UI
  // ==================================================================
  // ---- Tema (modo nocturno) ----
  // Iconos monocromáticos (heredan el color del texto con currentColor).
  const ICON_MOON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  const ICON_SUN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(LS_THEME, theme);
    if (el.themeToggle) el.themeToggle.innerHTML = theme === "dark" ? ICON_SUN : ICON_MOON;
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

    el.fabAdd.onclick = () => openModal(null);
    el.switchUser.onclick = () => {
      localStorage.removeItem(LS_USER);
      showOnboarding();
    };
    el.themeToggle.onclick = toggleTheme;

    // Modal
    populateTimeSelects();
    el.form.onsubmit = saveEvent;
    el.deleteBtn.onclick = deleteEvent;
    el.modal.querySelectorAll("[data-close]").forEach((n) => (n.onclick = closeModal));
    el.fFor.querySelectorAll(".seg").forEach((b) => (b.onclick = () => setModalFor(b.dataset.for)));

    // Toggle "repetir cada semana"
    $("#f-repeat").onclick = () => setRepeat(!modalRepeat);

    // Mensajería
    el.chatForm.onsubmit = sendMessage;

    // Listas (Compras y Pendientes)
    for (const key of LIST_KEYS) {
      const form = listEls(key).form;
      form.onsubmit = (e) => {
        e.preventDefault();
        const input = form.querySelector("input");
        const text = input.value.trim();
        if (!text) return;
        input.value = "";
        addItem(key, text);
      };
    }

    // Nav (3 toques seguidos en una pestaña ofrecen vaciar esa sección)
    el.navItems.forEach((n) => (n.onclick = () => {
      switchView(n.dataset.view);
      registerTap(n.dataset.view);
    }));

    // Modal de vaciado
    $("#wipe-form").onsubmit = confirmWipe;
    $("#wipe-modal").querySelectorAll("[data-close]").forEach((n) => (n.onclick = closeWipeModal));
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
  //  Instalación de la PWA
  // ==================================================================
  let deferredPrompt = null;

  function setupInstall() {
    // Chrome/Android dispara este evento cuando la app es instalable.
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      el.installBtn.classList.remove("hidden");
    });

    el.installBtn.onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      el.installBtn.classList.add("hidden");
    };

    // Ya instalada: ocultar el botón.
    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      el.installBtn.classList.add("hidden");
    });
    if (window.matchMedia("(display-mode: standalone)").matches) {
      el.installBtn.classList.add("hidden");
    }
  }

  // ==================================================================
  //  Arranque
  // ==================================================================
  function main() {
    applyTheme(localStorage.getItem(LS_THEME) === "dark" ? "dark" : "light");
    setupInstall();
    bindUI();
    registerSW();
    initFirebase();
    loadUser();

    // Con la app abierta, los tildados también se vencen solos a las 24 hs.
    setInterval(() => {
      for (const key of LIST_KEYS) {
        purgeOldDone(key);
        renderList(key);
      }
    }, 3e5);
  }

  document.addEventListener("DOMContentLoaded", main);
})();
