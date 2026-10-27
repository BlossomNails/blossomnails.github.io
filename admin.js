/* Blossom Beauty Salon — Mica's panel (admin.html).
   Uses the same data layer as the booking page (core.js): Supabase when configured, modo demo otherwise. */

const A = {
  db: null,
  data: null,
  dlg: null,          // which dialog is open: "appt", "detail", "service", ...
  agenda: { mode: "lista", filter: "proximas", day: null, staff: "" },
  clients: { q: "", filter: "todas" },
  month: null,        // control financiero, "YYYY-MM"
  known: null,        // web booking ids already seen, for the "nueva reserva" notice
};
let E = null; // the appointment being edited

const D = () => A.data;
const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || (a.name || "").localeCompare(b.name || "");
const byTime = (a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min;
const activeStaff = () => D().staff.filter((s) => s.active).sort(bySort);
const multi = () => activeStaff().length > 1;
const staffById = (id) => D().staff.find((s) => s.id === id);
const clientById = (id) => D().clients.find((c) => c.id === id);
const svcById = (id) => D().services.find((s) => s.id === id);
const live = (a) => !OFF.includes(a.status);
const num = (v) => { const d = String(v ?? "").replace(/\D/g, ""); return d ? +d : null; };
const fmtNum = (n) => (n == null ? "" : n.toLocaleString("es-PY").replace(/,/g, "."));
const sum = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);
const bookingUrl = () => location.origin + location.pathname.replace(/[^/]*$/, "");
const isPast = (a, now = nowInSalon()) => a.date < now.key || (a.date === now.key && a.end_min <= now.minute);

const STATUS = { confirmed: "Confirmada", pending: "Por confirmar", cancelled: "Cancelada", no_show: "No vino" };
const apptTitle = (a) => (a.kind === "block" ? a.notes || "Horario bloqueado" : a.client_name || "Sin nombre");
const itemsText = (a) => (a.items || []).map((i) => i.name).join(" · ");
function relDay(k) {
  const t = nowInSalon().key;
  if (k === t) return "Hoy";
  if (k === addDays(t, 1)) return "Mañana";
  if (k === addDays(t, -1)) return "Ayer";
  return `${DAYS_SHORT[dowOf(k)]} ${shortDate(k)}`;
}

// the other parts of a booking made with several professionals, in order
const groupOf = (a) => (a.group_id ? D().appointments.filter((x) => x.group_id === a.group_id).sort(byTime) : [a]);
// active services that no active professional has, so they can't be booked
const uncovered = () => {
  const people = D().staff.filter((s) => s.active);
  return D().services.filter((sv) => sv.active && !people.some((st) => !st.service_ids || st.service_ids.includes(sv.id)));
};

// clientStats() per render; cleared whenever data changes
let statsCache = new Map();
const cstats = (c) => statsCache.get(c.id) || statsCache.set(c.id, clientStats(D(), c)).get(c.id);
const dueClients = () => D().clients.filter((c) => cstats(c).due).sort((a, b) => cstats(b).since - cstats(a).since);

/* ---------- icons ---------- */
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calx: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M9.5 13l5 5M14.5 13l-5 5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
};
const ic = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
const wa = '<svg class="ic" aria-hidden="true"><use href="#i-wa"/></svg>';

/* ---------- navigation ---------- */
const NAV = [
  { r: "inicio", label: "Inicio", ic: "home", tab: true },
  { r: "agenda", label: "Agenda", ic: "calendar", tab: true },
  { r: "servicios", label: "Servicios", ic: "scissors", tab: true },
  { r: "clientas", label: "Clientas", ic: "users" },
  { r: "galeria", label: "Galería", ic: "image" },
  { r: "horarios", label: "Horarios", ic: "clock" },
  { r: "especiales", label: "Días especiales", ic: "calx" },
  { r: "equipo", label: "Profesionales", ic: "user" },
  { r: "finanzas", label: "Control financiero", ic: "chart" },
  { r: "ajustes", label: "Ajustes", ic: "sliders" },
];
const MORE = ["mas", "clientas", "clienta", "galeria", "horarios", "especiales", "equipo", "finanzas", "ajustes"];

function renderNav() {
  const due = dueClients().length;
  const pend = D().appointments.filter((a) => a.status === "pending" && !isPast(a)).length;
  const badge = (r) => (r === "clientas" && due ? `<span class="count">${due}</span>` : r === "inicio" && pend ? `<span class="count">${pend}</span>` : "");
  $("#sidenav").innerHTML = `
    <button class="btn btn-rose wide" type="button" data-act="appt-new">${ic("plus")}Nueva cita</button>
    ${NAV.map((n) => `<a href="#/${n.r}" data-r="${n.r}">${ic(n.ic)}<span>${n.label}</span>${badge(n.r)}</a>`).join("")}
    <hr>
    <a href="./" target="_blank" rel="noopener">${ic("ext")}<span>Ver página de reservas</span></a>
    <button type="button" data-act="logout">${ic("logout")}<span>Cerrar sesión</span></button>`;
  const tab = (n) => `<a href="#/${n.r}" data-r="${n.r}">${ic(n.ic)}<span>${n.label}</span>${badge(n.r)}</a>`;
  $("#tabbar").innerHTML = `${tab(NAV[0])}${tab(NAV[1])}
    <button class="fab" type="button" data-act="appt-new" aria-label="Nueva cita">${ic("plus")}<span>Nueva cita</span></button>
    ${tab(NAV[2])}<a href="#/mas" data-r="mas">${ic("menu")}<span>Más</span>${due ? `<span class="count">${due}</span>` : ""}</a>`;
  markNav();
}
function markNav() {
  const r = route()[0];
  $$("#sidenav [data-r]").forEach((a) => a.setAttribute("aria-current", a.dataset.r === r || (r === "clienta" && a.dataset.r === "clientas") ? "page" : "false"));
  $$("#tabbar [data-r]").forEach((a) => a.setAttribute("aria-current", a.dataset.r === r || (a.dataset.r === "mas" && MORE.includes(r)) ? "page" : "false"));
}

const route = () => { const [r, p] = location.hash.replace(/^#\/?/, "").split("/"); return [r || "inicio", p ? decodeURIComponent(p) : null]; };

function render() {
  if (!A.data) return;
  statsCache = new Map();
  const [r, p] = route();
  const view = VIEWS[r] || VIEWS.inicio;
  $("#view").innerHTML = view(p);
  renderNav();
  AFTER[r]?.(p);
  const label = r === "clienta" ? clientById(p)?.name : (NAV.find((n) => n.r === r) || { label: r === "mas" ? "Más" : "Inicio" }).label;
  document.title = `${label || "Panel"} · Blossom`;
}

/* ---------- small UI helpers ---------- */
let toastTimer;
function toast(msg, ms = 2200) {
  const el = $("#toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

const dlgFocus = modalFocus($("#dlg"));
function openDlg(kind, title, html, { wide = false } = {}) {
  A.dlg = kind;
  $("#dlg-title").textContent = title;
  $("#dlg-body").innerHTML = html;
  $("#dlg").classList.toggle("wide", wide);
  $("#dlg").scrollTop = 0;
  if (!document.documentElement.classList.contains("dlg-open")) {
    document.documentElement.classList.add("dlg-open");
    dlgFocus.open();
  }
  setTimeout(() => ($("#dlg-body [autofocus]") || $("#dlg .close")).focus({ preventScroll: true }), 60);
}
function closeDlg() {
  if (!A.dlg) return;
  A.dlg = null; E = null;
  document.documentElement.classList.remove("dlg-open");
  dlgFocus.close();
}
const formError = (msg) => { const el = $(A.dlg ? "#dlg-body .form-error" : "#view .form-error"); el.textContent = msg; el.hidden = !msg; if (msg) el.scrollIntoView({ block: "nearest", behavior: motion() }); };

// runs a change and reports it; errors become a toast (the result is undefined then)
async function run(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { console.error(e); toast(e.message || "Algo salió mal. Probá de nuevo.", 4000); }
}

/* ---------- data ---------- */
function normalize(d) {
  d.settings = { ...SEED.settings, ...d.settings };
  TABLES.forEach((t) => { d[t] = d[t] || []; });
  d.appointments.forEach((a) => { a.items = a.items || []; a.kind = a.kind || "appointment"; });
  SETTINGS = d.settings;
  return d;
}
async function reload({ quiet = false } = {}) {
  const prev = A.known;
  A.data = normalize(await A.db.loadAll());
  const web = A.data.appointments.filter((a) => a.source === "web");
  A.known = new Set(web.map((a) => a.id));
  if (prev) {
    const fresh = web.filter((a) => !prev.has(a.id));
    if (fresh.length) {
      const a = fresh[0];
      const msg = fresh.length === 1 ? `Nueva reserva: ${a.client_name} · ${relDay(a.date)} ${hhmm(a.start_min)}` : `${fresh.length} reservas nuevas desde la web`;
      toast(msg, 5000);
      try { if (Notification.permission === "granted") new Notification("Blossom", { body: msg, icon: "images/apple-touch-icon.png" }); } catch {}
    }
  }
  if (!quiet) render();
}
async function save(table, row) {
  const r = await A.db.save(table, row);
  const list = A.data[table];
  const i = list.findIndex((x) => x.id === r.id);
  if (i >= 0) list[i] = r; else list.push(r);
  if (table === "appointments" && r.source === "web") A.known?.add(r.id);
  return r;
}
async function remove(table, id) {
  await A.db.remove(table, id);
  A.data[table] = A.data[table].filter((x) => x.id !== id);
  if (table === "clients") A.data.appointments.forEach((a) => { if (a.client_id === id) a.client_id = null; });
  if (table === "staff") A.data.exceptions = A.data.exceptions.filter((e) => e.staff_id !== id);
}
async function saveSettings(patch) {
  const s = { ...D().settings, ...patch };
  await A.db.saveSettings(s);
  A.data.settings = SETTINGS = s;
}

/* =========================================================
   Views
   ========================================================= */
function apptCard(a, { date = false } = {}) {
  const block = a.kind === "block";
  const st = staffById(a.staff_id);
  const isNew = a.source === "web" && Date.now() - Date.parse(a.created_at) < 864e5;
  const badge = (a.status !== "confirmed" ? `<span class="badge b-${a.status}">${STATUS[a.status]}</span>` : isNew ? '<span class="badge b-new">Nueva</span>' : "")
    + (a.deposit > 0 ? '<span class="badge b-dep">Seña ✓</span>' : depositOpen(a) && !isPast(a) ? '<span class="badge b-dep-no">Sin seña</span>' : "")
    + (bdayGift(a) ? '<span class="badge" title="Regalo de cumpleaños">🎂</span>' : "");
  return `<button type="button" class="appt s-${a.status}${block ? " is-block" : ""}" data-act="appt-open" data-id="${a.id}">
    <span class="a-time">${date ? `<small class="a-date">${relDay(a.date)}</small>` : ""}<b>${hhmm(a.start_min)}</b><small>${hhmm(a.end_min)}</small></span>
    <span class="a-main"><b>${block ? ic("lock") : ""}${esc(apptTitle(a))}</b>
      <small>${block ? "Horario bloqueado" : esc(itemsText(a)) || "Sin servicios"}</small>
      ${multi() && st ? `<small class="a-staff">con ${esc(st.name)}</small>` : ""}</span>
    <span class="a-side">${block ? "" : `<b>${gs(a.total)}</b>`}${badge}</span>
  </button>`;
}
const empty = (msg) => `<div class="empty"><svg class="sparkle"><use href="#i-sparkle"/></svg><p>${msg}</p></div>`;
const section = (title, body, more = "") => `<section class="sec"><div class="sec-head"><h2>${title}</h2>${more}</div>${body}</section>`;

const VIEWS = {};
const AFTER = {};

/* ---- Inicio ---- */
VIEWS.inicio = () => {
  const now = nowInSalon();
  const appts = D().appointments.filter((a) => a.kind !== "block");
  const today = appts.filter((a) => a.date === now.key && live(a));
  const month = appts.filter((a) => a.date.startsWith(now.key.slice(0, 7)) && a.status === "confirmed" && a.date <= now.key);
  const pending = appts.filter((a) => a.status === "pending" && !isPast(a)).sort(byTime);
  const next = appts.filter((a) => live(a) && a.status !== "pending" && !isPast(a)).sort(byTime).slice(0, 6);
  const due = dueClients();
  const s = D().settings;
  const tomorrow = addDays(now.key, 1);
  const remind = appts.filter((a) => a.date === tomorrow && live(a) && groupOf(a)[0].id === a.id).sort(byTime);
  // recent visits whose client hasn't been asked for a review yet, one per client
  const since = addDays(now.key, -7);
  const asked = new Set();
  const reviews = appts.filter((a) => a.status === "confirmed" && isPast(a, now) && a.date >= since && a.client_id && a.client_phone)
    .sort((a, b) => byTime(b, a))
    .filter((a) => { const c = clientById(a.client_id); if (!c || c.review_requested_at || asked.has(c.id)) return false; asked.add(c.id); return true; });
  const setup = [!s.deposit_enabled && "la seña", !s.review_url && "tu link de reseñas de Google"].filter(Boolean);
  const orphan = uncovered();
  const bdays = birthdays();
  return `
    <div class="hello">
      <h1>Hola, <em>${esc(D().settings.owner_name || "Mica")}</em></h1>
      <p class="muted">${longDate(now.key)}</p>
    </div>
    <div class="stats">
      <a class="stat" href="#/agenda" data-act="agenda-today">${ic("calendar")}<b>${today.length}</b><small>Citas hoy</small></a>
      <div class="stat">${ic("chart")}<b>${gs(sum(today.filter((a) => a.status === "confirmed"), (a) => a.total))}</b><small>Ingresos de hoy</small></div>
    </div>
    ${orphan.length ? `<a class="row-link setup warnlink" href="#/equipo">${ic("user")}<span><b>${orphan.length} servicio${orphan.length === 1 ? "" : "s"} no se puede${orphan.length === 1 ? "" : "n"} reservar</b><small>No los tiene marcados ninguna profesional. Tocá para asignarlos.</small></span>${ic("right")}</a>` : ""}
    ${setup.length ? `<a class="row-link setup" href="#/ajustes">${ic("sliders")}<span><b>Para terminar de configurar</b><small>Cargá ${setup.join(" y ")} en Ajustes.</small></span>${ic("right")}</a>` : ""}
    <a class="row-link" href="#/finanzas">${ic("chart")}<span><b>Control financiero</b><small>Este mes: ${gs(sum(month, (a) => a.total))} · ${month.length} cita${month.length === 1 ? "" : "s"}</small></span>${ic("right")}</a>
    ${pending.length ? section(`Por confirmar <span class="count">${pending.length}</span>`, `<div class="list">${pending.map((a) => apptCard(a, { date: true })).join("")}</div>`) : ""}
    ${remind.length ? section(`Recordatorios para mañana <span class="count">${remind.filter((a) => !a.reminded_at).length || "✓"}</span>`,
      `<p class="hint">Un toque y le llega el recordatorio por WhatsApp.</p><div class="list">${remind.map(remindRow).join("")}</div>`) : ""}
    ${bdays.length ? section(`Cumpleaños <span class="count">${bdays.filter(({ c, nb }) => !bdayGreeted(c, nb)).length || "✓"}</span>`,
      `<p class="hint">Saludala con ${esc(s.birthday_gift || "tu regalo")} para su próximo turno. El regalo y el mensaje se cambian en <a href="#/ajustes">Ajustes</a>.</p><div class="list">${bdays.map(bdayRow).join("")}</div>`) : ""}
    ${section("Próximas citas", next.length ? `<div class="list">${next.map((a) => apptCard(a, { date: true })).join("")}</div>` : empty("Aún no hay citas próximas."), '<a class="more" href="#/agenda">Ver agenda</a>')}
    ${section(`Para volver a agendar${due.length ? ` <span class="count">${due.length}</span>` : ""}`,
      due.length ? `<p class="hint">Vinieron hace ${D().settings.reminder_days} días o más y no tienen turno.</p><div class="list">${due.slice(0, 5).map(dueRow).join("")}</div>`
        : `<p class="hint">Acá van a aparecer las clientas que vinieron hace ${D().settings.reminder_days} días o más y todavía no reservaron.</p>`,
      due.length > 5 ? '<a class="more" href="#/clientas" data-act="clients-due">Ver todas</a>' : "")}
    ${reviews.length ? section(`Pedir reseña <span class="count">${reviews.length}</span>`, s.review_url
      ? `<p class="hint">Vinieron esta semana. Una reseña en Google te ayuda a que te encuentren.</p><div class="list">${reviews.slice(0, 5).map(reviewRow).join("")}</div>`
      : `<p class="hint">Hay ${reviews.length} clienta${reviews.length === 1 ? "" : "s"} que vinieron esta semana. Cargá tu link de reseñas de Google en <a href="#/ajustes">Ajustes</a> para pedirles una reseña con un toque.</p>`) : ""}
    <section class="share">
      <p><b>Tu enlace de reservas</b><small>Mandalo a tus clientas o ponelo en Instagram: reservan solas, sin llamarte.</small></p>
      <code>${esc(bookingUrl())}</code>
      <div class="row"><button class="btn btn-ghost" type="button" data-act="copy-link">${ic("copy")}Copiar enlace</button><a class="btn btn-ghost" href="./" target="_blank" rel="noopener">${ic("ext")}Abrir</a></div>
    </section>`;
};

function remindRow(a) {
  const sent = !!a.reminded_at;
  return `<div class="c-row${sent ? " sent" : ""}">
    <button type="button" class="c-link" data-act="appt-open" data-id="${a.id}"><span class="r-time">${hhmm(a.start_min)}</span>
      <span class="c-main"><b>${esc(a.client_name || "Sin nombre")}</b><small>${esc(a.group_id ? partsText(a) : itemsText(a))}${depositOpen(a) ? " · sin seña" : ""}</small></span></button>
    ${a.client_phone ? `<a class="btn ${sent ? "btn-ghost" : "btn-wa"} sm" href="${waLink(apptReminderMsg(a), a.client_phone)}" target="_blank" rel="noopener" data-act="appt-remind" data-id="${a.id}">${sent ? "Enviado ✓" : wa + "Recordar"}</a>` : '<small class="muted">sin WhatsApp</small>'}
  </div>`;
}

function bdayRow({ c, nb }) {
  return `<div class="c-row${bdayGreeted(c, nb) ? " sent" : ""}">
    <a class="c-link" href="#/clienta/${c.id}"><span class="avatar" aria-hidden="true">🎂</span>
      <span class="c-main"><b>${esc(c.name)}</b><small>${bdayWhen(nb)}</small></span></a>
    ${bdayButton(c, nb)}
  </div>`;
}

function reviewRow(a) {
  const c = clientById(a.client_id);
  return `<div class="c-row">
    <a class="c-link" href="#/clienta/${c.id}"><span class="avatar">${esc(c.name.trim()[0] || "?")}</span>
      <span class="c-main"><b>${esc(c.name)}</b><small>Vino ${relDay(a.date).toLowerCase()} · ${esc(itemsText(a))}</small></span></a>
    <a class="btn btn-wa sm" href="${waLink(reviewMsg(c), c.phone || a.client_phone)}" target="_blank" rel="noopener" data-act="review-ask" data-id="${c.id}">${ic("star")}Pedir</a>
  </div>`;
}

function dueRow(c) {
  const st = cstats(c);
  return `<div class="c-row due">
    <a class="c-link" href="#/clienta/${c.id}"><span class="avatar">${esc(c.name.trim()[0] || "?")}</span>
      <span class="c-main"><b>${esc(c.name)}</b><small>Última visita hace ${st.since} días</small></span></a>
    ${c.phone ? `<a class="btn btn-wa sm" href="${waLink(reminderText(D(), c, st.since), c.phone)}" target="_blank" rel="noopener" data-act="remind" data-id="${c.id}">${wa}Escribir</a>` : ""}
  </div>`;
}

/* ---- Agenda ---- */
VIEWS.agenda = () => {
  const ag = A.agenda;
  ag.day ||= nowInSalon().key;
  const staffSel = multi() ? `<select class="field sm" data-change="agenda-staff" aria-label="Profesional">
      <option value="">Todas</option>${activeStaff().map((s) => `<option value="${s.id}"${ag.staff === s.id ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` : "";
  return `
    <div class="page-head"><h1>Agenda</h1><button class="btn btn-ghost sm" type="button" data-act="block-new">${ic("lock")}Bloquear horario</button></div>
    <div class="toolbar">
      <div class="seg" role="tablist">
        <button type="button" role="tab" data-act="agenda-mode" data-v="lista" aria-selected="${ag.mode === "lista"}">Lista</button>
        <button type="button" role="tab" data-act="agenda-mode" data-v="dia" aria-selected="${ag.mode === "dia"}">Por día</button>
      </div>${staffSel}
    </div>
    ${ag.mode === "lista" ? agendaList() : agendaDay()}`;
};

function agendaList() {
  const ag = A.agenda, now = nowInSalon();
  let items = D().appointments.filter((a) => !ag.staff || a.staff_id === ag.staff);
  if (ag.filter === "hoy") items = items.filter((a) => a.date === now.key).sort(byTime);
  else if (ag.filter === "proximas") items = items.filter((a) => live(a) && !isPast(a, now)).sort(byTime);
  else if (ag.filter === "pasadas") items = items.filter((a) => isPast(a, now)).sort((a, b) => byTime(b, a)).slice(0, 200);
  else items = items.sort((a, b) => byTime(b, a)).slice(0, 300);
  const chips = [["hoy", "Hoy"], ["proximas", "Próximas"], ["pasadas", "Pasadas"], ["todas", "Todas"]]
    .map(([v, l]) => `<button type="button" class="chip" data-act="agenda-filter" data-v="${v}" aria-current="${ag.filter === v}">${l}</button>`).join("");
  const days = [...new Set(items.map((a) => a.date))];
  const body = days.length ? days.map((k) => {
    const list = items.filter((a) => a.date === k);
    const money = sum(list.filter((a) => a.kind !== "block" && live(a)), (a) => a.total);
    return `<h3 class="day-h"><span>${relDay(k) === DAYS_SHORT[dowOf(k)] + " " + shortDate(k) ? longDate(k) : `${relDay(k)} · ${longDate(k)}`}</span><small>${money ? gs(money) : ""}</small></h3>
      <div class="list">${list.map((a) => apptCard(a)).join("")}</div>`;
  }).join("") : empty(ag.filter === "hoy" ? "No hay citas para hoy." : "Sin citas.");
  return `<div class="chips-row">${chips}</div>${body}`;
}

function agendaDay() {
  const ag = A.agenda, now = nowInSalon();
  const k = ag.day;
  const strip = Array.from({ length: 14 }, (_, i) => addDays(k, i - 3)).map((d) => {
    const n = D().appointments.filter((a) => a.date === d && live(a) && a.kind !== "block" && (!ag.staff || a.staff_id === ag.staff)).length;
    return `<button type="button" class="pill pill-day${d === now.key ? " is-today" : ""}" data-act="agenda-day" data-v="${d}" aria-pressed="${d === k}">${DAYS_SHORT[dowOf(d)]}<small>${+d.slice(8)}</small>${n ? `<i class="dot" aria-label="${n} citas"></i>` : ""}</button>`;
  }).join("");
  const list = D().appointments.filter((a) => a.date === k && (!ag.staff || a.staff_id === ag.staff));
  const money = sum(list.filter((a) => a.kind !== "block" && live(a)), (a) => a.total);
  return `
    <div class="daybar">
      <button class="icon-btn sm" type="button" data-act="agenda-shift" data-v="-7" aria-label="Semana anterior">${ic("left")}</button>
      <input class="field sm" type="date" value="${k}" data-change="agenda-date" aria-label="Elegir fecha">
      <button class="icon-btn sm" type="button" data-act="agenda-shift" data-v="7" aria-label="Semana siguiente">${ic("right")}</button>
      <button class="btn btn-ghost sm" type="button" data-act="agenda-day" data-v="${now.key}">Hoy</button>
    </div>
    <div class="pills scroll strip">${strip}</div>
    <h3 class="day-h"><span>${longDate(k)}</span><small>${list.filter((a) => a.kind !== "block" && live(a)).length} citas${money ? " · " + gs(money) : ""}</small></h3>
    ${timeline(k)}
    <p class="hint center">Tocá un espacio libre para agendar a esa hora.</p>`;
}

const PX = 1.15; // pixels per minute in the day view
function timeline(k) {
  const ag = A.agenda;
  let people = ag.staff ? [staffById(ag.staff)] : activeStaff();
  if (!people.length) people = [null];
  const appts = D().appointments.filter((a) => a.date === k && live(a) && (!ag.staff || a.staff_id === ag.staff));
  const blocks = people.map((p) => blocksFor(D(), p, k));
  const from = Math.floor(Math.min(480, ...blocks.flat().map((b) => b[0]), ...appts.map((a) => a.start_min)) / 60) * 60;
  const to = Math.ceil(Math.max(1140, ...blocks.flat().map((b) => b[1]), ...appts.map((a) => a.end_min)) / 60) * 60;
  const y = (m) => (m - from) * PX;
  const hours = [];
  for (let h = from; h <= to; h += 60) hours.push(`<span class="tl-h" style="top:${y(h)}px">${hhmm(h)}</span>`);
  const cols = people.map((p, ci) => {
    // closed time is shaded
    const open = blocks[ci].slice().sort((a, b) => a[0] - b[0]);
    const shade = [];
    let cur = from;
    open.forEach(([o, c]) => { if (o > cur) shade.push([cur, o]); cur = Math.max(cur, c); });
    if (cur < to) shade.push([cur, to]);
    const mine = appts.filter((a) => (p ? a.staff_id === p.id || (ci === 0 && !people.some((x) => x && x.id === a.staff_id)) : true)).sort((a, b) => a.start_min - b.start_min);
    // side-by-side lanes when appointments overlap
    const lanes = [];
    const placed = mine.map((a) => {
      let l = lanes.findIndex((end) => end <= a.start_min);
      if (l < 0) { l = lanes.length; lanes.push(0); }
      lanes[l] = a.end_min;
      return { a, l };
    });
    const w = 100 / Math.max(1, lanes.length);
    return `<div class="tl-col" data-staff="${p ? p.id : ""}" data-from="${from}" style="height:${y(to)}px">
      ${shade.map(([a, b]) => `<i class="tl-off" style="top:${y(a)}px;height:${(b - a) * PX}px"></i>`).join("")}
      ${placed.map(({ a, l }) => `<button type="button" class="tl-appt s-${a.status}${a.kind === "block" ? " is-block" : ""}" data-act="appt-open" data-id="${a.id}"
          style="top:${y(a.start_min)}px;height:${Math.max(26, (a.end_min - a.start_min) * PX - 2)}px;left:calc(${l * w}% + 2px);width:calc(${w}% - 4px)">
          <b>${hhmm(a.start_min)} ${esc(apptTitle(a))}</b><small>${a.kind === "block" ? "Bloqueado" : esc(itemsText(a))}</small></button>`).join("")}
    </div>`;
  });
  return `<div class="tl" style="--cols:${people.length};--hour:${60 * PX}px">
    ${people.length > 1 ? `<div class="tl-names"><span></span>${people.map((p) => `<b>${esc(p.name)}</b>`).join("")}</div>` : ""}
    <div class="tl-grid"><div class="tl-hours" style="height:${y(to)}px">${hours.join("")}</div>${cols.join("")}</div>
  </div>`;
}
AFTER.agenda = () => {
  const first = $(".tl-appt") || $(".tl-h");
  if (A.agenda.mode === "dia" && first) $(".strip [aria-pressed='true']")?.scrollIntoView({ inline: "center", block: "nearest" });
};

/* ---- messages ---- */
const firstName = (n) => (n || "").trim().split(" ")[0];
const fill = (tpl, vars) => String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
// a seña was asked for and hasn't been paid yet
const depositOpen = (a) => a.deposit_due > 0 && a.deposit == null && live(a);

const partsText = (a) => groupOf(a).map((x) => `${hhmm(x.start_min)} ${itemsText(x).replace(/ · /g, ", ")} con ${firstName(staffById(x.staff_id)?.name)}`).join("; ");
function confirmMsg(a) {
  if (a.group_id) a = { ...groupOf(a)[0], items: groupOf(a).flatMap((x) => x.items), deposit_due: groupOf(a)[0].deposit_due };
  const when = `${DAYS[dowOf(a.date)].toLowerCase()} ${shortDate(a.date)} a las ${hhmm(a.start_min)} hs`;
  const first = firstName(a.client_name);
  if (a.status === "cancelled") return `¡Hola ${first}! Tu turno del ${when} quedó cancelado. Cuando quieras, reservás de nuevo acá: ${bookingUrl()} 🌸`;
  const s = D().settings;
  const pay = depositOpen(a) && s.payment_info
    ? `\n\nPara dejarlo confirmado te pido una seña de ${gs(a.deposit_due)}:\n${s.payment_info}\nMandame el comprobante por acá. Si preferís pagar con tarjeta de crédito, débito o QR, avisame y te paso los datos. ¡Gracias!` : "";
  const what = a.group_id ? ` (${partsText(a)})` : a.items.length ? ` (${itemsText(a).replace(/ · /g, ", ")})` : "";
  return `¡Hola ${first}! 🌸 Te confirmo tu turno en Blossom el ${when}${what}. ¡Te espero!${pay}`;
}
function apptReminderMsg(a) {
  const first = groupOf(a)[0];
  return fill(D().settings.appt_reminder_text, {
    nombre: firstName(a.client_name), dia: `${DAYS[dowOf(a.date)].toLowerCase()} ${shortDate(a.date)}`,
    hora: `${hhmm(first.start_min)} hs`, servicios: a.group_id ? partsText(a) : itemsText(a).replace(/ · /g, ", ") || "tu turno",
  });
}
const reviewMsg = (c) => fill(D().settings.review_text, { nombre: firstName(c.name), link: D().settings.review_url });

/* ---- birthdays: saved as "MM-DD", without the year ---- */
const BDAY_DAYS = 7; // Inicio shows birthdays up to a week ahead
const bdayText = (b) => `${+b.slice(3)} de ${MONTHS[+b.slice(0, 2) - 1]}`;
// her birthday nearest to today; one from the last 3 days still counts while the greeting is pending (29/2 → 1/3)
function nextBday(b, now = nowInSalon()) {
  if (!b) return null;
  const y = +now.key.slice(0, 4);
  const key = [y - 1, y, y + 1].map((yy) => keyOf(parseKey(`${yy}-${b}`))).find((k) => k >= addDays(now.key, -3));
  return { key, days: daysBetween(now.key, key) };
}
const bdayGreeted = (c, nb) => !!c.birthday_greeted_at && c.birthday_greeted_at >= addDays(nb.key, -30);
const birthdays = () => D().clients.map((c) => ({ c, nb: nextBday(c.birthday) }))
  .filter(({ c, nb }) => nb && nb.days <= BDAY_DAYS && (nb.days >= 0 || !bdayGreeted(c, nb)))
  .sort((x, y) => x.nb.days - y.nb.days);
const bdayWhen = ({ days, key }) => (days === 0 ? "¡Cumple hoy!" : days === 1 ? "Cumple mañana" : days === -1 ? "Cumplió ayer"
  : `${days < 0 ? "Cumplió" : "Cumple"} el ${DAYS[dowOf(key)].toLowerCase()} ${shortDate(key)}`);
const bdayMsg = (c) => fill(D().settings.birthday_text, { nombre: firstName(c.name), regalo: D().settings.birthday_gift, link: bookingUrl() });
// her first turn after the birthday greeting is the one with the gift
function bdayGift(a) {
  const c = a.kind !== "block" && a.client_id && clientById(a.client_id);
  if (!c?.birthday_greeted_at || a.date < c.birthday_greeted_at || daysBetween(c.birthday_greeted_at, a.date) > 60) return false;
  const first = D().appointments.filter((x) => x.client_id === c.id && x.kind !== "block" && live(x) && x.date >= c.birthday_greeted_at).sort(byTime)[0];
  return !!first && groupOf(first)[0].id === groupOf(a)[0].id;
}
function bdayButton(c, nb) {
  if (!c.phone) return '<small class="muted">sin WhatsApp</small>';
  const sent = bdayGreeted(c, nb);
  return `<a class="btn ${sent ? "btn-ghost" : "btn-wa"} sm" href="${waLink(bdayMsg(c), c.phone)}" target="_blank" rel="noopener" data-act="bday-sent" data-id="${c.id}">${sent ? "Saludada ✓" : wa + "Saludar"}</a>`;
}

/* ---- Appointment detail ---- */

function openDetail(id) {
  const a = D().appointments.find((x) => x.id === id);
  if (!a) return closeDlg();
  const block = a.kind === "block";
  const st = staffById(a.staff_id);
  openDlg("detail", block ? "Horario bloqueado" : a.client_name || "Cita", `
    <div class="det" data-id="${a.id}">
      <div class="det-badges"><span class="badge b-${a.status}">${block ? "Bloqueado" : STATUS[a.status]}</span>${a.source === "web" ? '<span class="badge b-web">Reservó por la web</span>' : ""}${bdayGift(a) ? `<span class="badge">🎂 Regalo de cumple: ${esc(D().settings.birthday_gift)}</span>` : ""}</div>
      <p class="det-when">${longDate(a.date)}<br><b>${hhmm(a.start_min)} – ${hhmm(a.end_min)}</b> <span class="muted">· ${dur(a.end_min - a.start_min)}</span></p>
      ${st && (multi() || block) ? `<p class="muted">Con ${esc(st.name)}</p>` : ""}
      ${a.group_id ? `<div class="parts"><span class="lbl">Reserva con turnos seguidos</span>${groupOf(a).map((x) => `
        <button type="button" class="part${x.id === a.id ? " on" : ""}" data-act="appt-open" data-id="${x.id}">
          <b>${hhmm(x.start_min)}–${hhmm(x.end_min)}</b><span>${esc(firstName(staffById(x.staff_id)?.name) || "—")} · ${esc(itemsText(x))}</span></button>`).join("")}</div>` : ""}
      ${block ? (a.notes ? `<p>${esc(a.notes)}</p>` : "") : `
        <ul class="det-items">${a.items.map((i) => `<li><span>${esc(i.name)}</span><small>${i.duration ? dur(i.duration) : ""}</small><b>${i.price != null ? gs(i.price) : "—"}</b></li>`).join("")}
          <li class="tot"><span>Total</span><small></small><b>${gs(a.total)}</b></li></ul>
        ${a.client_phone ? `<p class="det-phone">${ic("user")}${fmtPhone(a.client_phone)}</p>` : ""}
        ${a.notes ? `<p class="det-notes">${esc(a.notes)}</p>` : ""}
        <div class="dep">
          ${ic("card")}
          ${a.deposit != null
            ? `<span>Seña cobrada: <b>${gs(a.deposit)}</b></span><button class="btn btn-ghost sm" type="button" data-act="dep-clear">Quitar</button>`
            : `<span>${a.deposit_due ? `Seña: <b>${gs(a.deposit_due)}</b> · pendiente` : "Seña"}</span>
              <input class="field sm" id="dep-amount" inputmode="numeric" data-money value="${fmtNum(a.deposit_due || (D().settings.deposit_type === "fixed" && D().settings.deposit_value) || null)}" placeholder="Monto" aria-label="Monto de la seña">
              <button class="btn btn-rose sm" type="button" data-act="dep-paid">Cobrada</button>`}
        </div>`}
    </div>
    <div class="det-actions">
      ${!block && a.client_phone ? `<a class="btn btn-wa" href="${waLink(confirmMsg(a), a.client_phone)}" target="_blank" rel="noopener">${wa}WhatsApp</a>` : ""}
      <button class="btn btn-ghost" type="button" data-act="appt-edit" data-id="${a.id}">${ic("edit")}Editar</button>
      ${a.client_id ? `<a class="btn btn-ghost" href="#/clienta/${a.client_id}" data-act="nav">${ic("user")}Ficha</a>` : ""}
      ${!block && a.client_phone && live(a) && !isPast(a) ? `<a class="btn btn-ghost" href="${waLink(apptReminderMsg(a), a.client_phone)}" target="_blank" rel="noopener" data-act="appt-remind" data-id="${a.id}">${ic("bell")}${a.reminded_at ? "Recordado ✓" : "Recordatorio"}</a>` : ""}
      ${!block && a.client_phone && a.client_id && a.status === "confirmed" && isPast(a) && D().settings.review_url ? `<a class="btn btn-ghost" href="${waLink(reviewMsg({ name: a.client_name }), a.client_phone)}" target="_blank" rel="noopener" data-act="review-ask" data-id="${a.client_id}">${ic("star")}${clientById(a.client_id)?.review_requested_at ? "Reseña pedida ✓" : "Pedir reseña"}</a>` : ""}
    </div>
    ${block ? "" : `<div class="det-status">
      ${a.status === "pending" ? `<button class="btn btn-rose" type="button" data-act="appt-status" data-s="confirmed">Confirmar</button>` : ""}
      ${live(a) ? `<button class="btn btn-ghost" type="button" data-act="appt-status" data-s="no_show">No vino</button>
        <button class="btn btn-ghost" type="button" data-act="appt-status" data-s="cancelled">Cancelar cita</button>`
        : `<button class="btn btn-ghost" type="button" data-act="appt-status" data-s="confirmed">Reactivar</button>`}
    </div>`}
    <button class="link-danger" type="button" data-act="appt-delete" data-id="${a.id}">${ic("trash")}Eliminar${block ? " bloqueo" : " cita"}</button>`);
}

/* ---- Appointment editor: services with editable price and duration ---- */
function openEditor(a = {}) {
  const now = nowInSalon();
  E = {
    id: a.id || null,
    client_id: a.client_id || null,
    name: a.client_name || "",
    phone: a.client_phone ? fmtPhone(a.client_phone) : "",
    staff_id: a.staff_id || activeStaff()[0]?.id || D().staff[0]?.id || null,
    date: a.date || now.key,
    start: a.start_min ?? null,
    lines: (a.items || []).map((x) => ({ ...x })),
    status: a.status && a.status !== "cancelled" && a.status !== "no_show" ? a.status : "confirmed",
    notes: a.notes || "",
  };
  const staffOpts = D().staff.filter((s) => s.active || s.id === E.staff_id).sort(bySort);
  openDlg("appt", E.id ? "Editar cita" : "Nueva cita", `
    <label class="lbl" for="e-name">Clienta</label>
    <div class="combo">
      <input class="field" id="e-name" data-f="name" value="${esc(E.name)}" placeholder="Nombre o buscá una clienta" autocomplete="off" ${E.id ? "" : "autofocus"}>
      <div class="suggest" id="e-suggest"></div>
    </div>
    <input class="field mt" data-f="phone" type="tel" inputmode="tel" value="${esc(E.phone)}" placeholder="WhatsApp (opcional), ej.: 0981 123 456" aria-label="WhatsApp de la clienta">
    ${staffOpts.length > 1 ? `<label class="lbl" for="e-staff">Profesional</label>
      <select class="field" id="e-staff" data-f="staff_id">${staffOpts.map((s) => `<option value="${s.id}"${s.id === E.staff_id ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` : ""}
    <label class="lbl">Servicios <small>· el precio y la duración se pueden cambiar</small></label>
    <div id="e-lines" class="lines"></div>
    <div class="row">
      <button class="btn btn-ghost sm" type="button" data-act="e-add">${ic("plus")}Agregar servicio</button>
      <button class="btn btn-ghost sm" type="button" data-act="e-custom">${ic("plus")}Otro</button>
    </div>
    <div class="picker" id="e-picker" hidden>
      <input class="field sm" type="search" id="e-q" placeholder="Buscar servicio…" aria-label="Buscar servicio">
      <div class="picker-list" id="e-plist"></div>
    </div>
    <div class="e-total" id="e-total"></div>
    <div class="two">
      <label><span class="lbl">Fecha</span><input class="field" type="date" data-f="date" value="${E.date}"></label>
      <label><span class="lbl">Hora</span><input class="field" type="time" step="300" data-f="start" value="${E.start != null ? hhmm(E.start) : ""}"></label>
    </div>
    <div id="e-free" class="free"></div>
    <div id="e-warn"></div>
    <label class="lbl">Estado</label>
    <div class="seg" id="e-status">
      <button type="button" data-act="e-status" data-v="confirmed" aria-selected="${E.status === "confirmed"}">Confirmada</button>
      <button type="button" data-act="e-status" data-v="pending" aria-selected="${E.status === "pending"}">Por confirmar</button>
    </div>
    <label class="lbl" for="e-notes">Notas</label>
    <textarea class="field" id="e-notes" data-f="notes" rows="2" placeholder="Diseño, color, referencias…">${esc(E.notes)}</textarea>
    <p class="form-error" role="alert" hidden></p>
    <div class="dlg-foot"><button class="btn btn-rose wide" type="button" data-act="e-save">Guardar cita</button></div>`);
  paintLines();
  paintEditorMeta();
}

function paintLines() {
  $("#e-lines").innerHTML = E.lines.length ? E.lines.map((l, i) => `
    <div class="line" data-i="${i}">
      <input class="field l-name" data-l="name" value="${esc(l.name)}" placeholder="Servicio" aria-label="Servicio">
      <label class="l-num"><span>Precio (Gs.)</span><input class="field" data-l="price" inputmode="numeric" value="${fmtNum(l.price)}" placeholder="0"></label>
      <label class="l-num"><span>Minutos</span><input class="field" data-l="duration" inputmode="numeric" value="${l.duration ?? ""}" placeholder="0"></label>
      <button type="button" class="rm" data-act="e-rm" aria-label="Quitar ${esc(l.name || "servicio")}">×</button>
    </div>`).join("") : '<p class="hint">Agregá uno o más servicios. Después podés ajustar el precio y cuánto tarda.</p>';
}

function paintEditorMeta() {
  if (!E) return;
  const duration = sum(E.lines, (l) => l.duration);
  const total = sum(E.lines, (l) => l.price);
  $("#e-total").innerHTML = `<span>Total${duration ? ` · ${dur(duration)}` : ""}${E.start != null && duration ? ` · termina ${hhmm(E.start + duration)}` : ""}</span><b>${gs(total)}</b>`;
  const st = staffById(E.staff_id);
  const now = nowInSalon();
  // suggested free times for that day
  const free = st && E.date && duration ? freeStarts(D(), st, E.date, duration, { ignoreId: E.id, notice: 0, now }) : [];
  $("#e-free").innerHTML = free.length
    ? `<span class="lbl">Horarios libres</span><div class="pills">${free.slice(0, 30).map((m) => `<button type="button" class="pill sm" data-act="e-time" data-v="${m}" aria-pressed="${E.start === m}">${hhmm(m)}</button>`).join("")}</div>`
    : st && E.date && duration ? `<p class="hint">No quedan horarios libres para ${dur(duration)} ese día. Igual podés elegir la hora a mano.</p>` : "";
  const warn = [];
  if (st && E.start != null && duration) {
    const end = E.start + duration;
    if (!fitsHours(blocksFor(D(), st, E.date), E.start, end)) warn.push("Queda fuera del horario de atención.");
    const clash = D().appointments.filter((a) => a.id !== E.id && a.staff_id === st.id && a.date === E.date && live(a) && E.start < a.end_min && end > a.start_min);
    if (clash.length) warn.push(`Se superpone con ${clash.map((a) => `${apptTitle(a)} (${hhmm(a.start_min)}–${hhmm(a.end_min)})`).join(", ")}.`);
  }
  if (E.date && E.date < now.key) warn.push("Es una fecha pasada: sirve para cargar visitas anteriores.");
  $("#e-warn").innerHTML = warn.map((w) => `<p class="warn">${esc(w)}</p>`).join("");
}

function paintSuggest() {
  const box = $("#e-suggest");
  const q = E.name.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const picked = E.client_id && clientById(E.client_id)?.name === E.name;
  if (picked || q.length < 2) { box.innerHTML = ""; return; }
  const hits = D().clients.filter((c) => c.name.toLowerCase().includes(q) || (digits.length > 3 && (c.phone || "").includes(digits))).slice(0, 6);
  box.innerHTML = hits.map((c) => `<button type="button" data-act="e-client" data-id="${c.id}"><b>${esc(c.name)}</b><small>${fmtPhone(c.phone) || "sin WhatsApp"}</small></button>`).join("");
}

function paintPicker() {
  const q = $("#e-q").value.trim().toLowerCase();
  const cats = [...D().categories].sort(bySort);
  const svcs = [...D().services].sort(bySort).filter((s) => !q || s.name.toLowerCase().includes(q));
  const adds = [...(D().addons || [])].sort(bySort).filter((a) => !q || a.name.toLowerCase().includes(q));
  const groups = [...cats.map((c) => [c.name, svcs.filter((s) => s.category_id === c.id)]), ["Otros", svcs.filter((s) => !cats.some((c) => c.id === s.category_id))],
    ["Adicionales", adds.map((a) => ({ ...a, isAddon: true }))]];
  $("#e-plist").innerHTML = groups.filter(([, l]) => l.length).map(([name, l]) => `<p class="picker-cat">${esc(name)}</p>${l.map((s) =>
    `<button type="button" data-act="${s.isAddon ? "e-pick-addon" : "e-pick"}" data-id="${s.id}"><span>${esc(s.name)}${s.active ? "" : " <em>(oculto)</em>"}</span><small>${s.price != null ? gs(s.price) : "Consultar"}${s.duration ? " · " + dur(s.duration) : ""}</small></button>`).join("")}`).join("")
    || '<p class="hint">No hay servicios con ese nombre. Usá "Otro" para escribirlo.</p>';
}

async function saveEditor() {
  const name = E.name.trim();
  const phone = normPhone(E.phone);
  const lines = E.lines.filter((l) => l.name.trim() || l.service_id).map((l) => ({
    service_id: l.service_id || null, ...(l.addon_id ? { addon_id: l.addon_id } : {}),
    name: l.name.trim() || "Servicio", price: l.price ?? null, duration: l.duration || 0,
  }));
  const duration = sum(lines, (l) => l.duration);
  if (!name) return formError("Escribí el nombre de la clienta.");
  if (E.phone.trim() && (phone.length < 8 || phone.length > 15)) return formError("Revisá el número de WhatsApp.");
  if (!lines.length) return formError("Agregá al menos un servicio.");
  if (!duration) return formError("Poné cuántos minutos dura.");
  if (!E.date) return formError("Elegí la fecha.");
  if (E.start == null) return formError("Elegí la hora.");
  if (E.start + duration > 1440) return formError("La cita termina después de medianoche. Revisá la hora o la duración.");
  formError("");

  // find or create the client
  let client = E.client_id ? clientById(E.client_id) : null;
  if (!client && phone) client = D().clients.find((c) => c.phone === phone);
  if (!client && !phone) client = D().clients.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
  const prev = E.id ? D().appointments.find((a) => a.id === E.id) : null;
  await run(async () => {
    if (!client) client = await save("clients", { id: uid(), name, phone: phone || null, notes: null, reminded_at: null, created_at: new Date().toISOString() });
    else if (phone && !client.phone) client = await save("clients", { ...client, phone });
    const row = await save("appointments", {
      id: E.id || uid(), kind: "appointment", client_id: client.id, client_name: name, client_phone: phone || client.phone || null,
      staff_id: E.staff_id, date: E.date, start_min: E.start, end_min: E.start + duration,
      items: lines, total: sum(lines, (l) => l.price), status: E.status, notes: E.notes.trim() || null,
      deposit_due: prev?.deposit_due ?? null, deposit: prev?.deposit ?? null, reminded_at: prev?.reminded_at ?? null,
      source: prev?.source || "panel", created_at: prev?.created_at || new Date().toISOString(),
    });
    render();
    openDetail(row.id);
  }, "Cita guardada ✓");
}

/* ---- block time ---- */
function openBlock(a = {}) {
  const now = nowInSalon();
  const staffOpts = activeStaff();
  openDlg("block", a.id ? "Editar bloqueo" : "Bloquear horario", `
    <p class="hint">Para un trámite, un turno médico o lo que sea: en ese horario no se puede reservar desde la web.</p>
    <form id="block-form" data-id="${a.id || ""}">
      <label><span class="lbl">Fecha</span><input class="field" type="date" name="date" value="${a.date || A.agenda.day || now.key}" required></label>
      <div class="two">
        <label><span class="lbl">Desde</span><input class="field" type="time" step="300" name="from" value="${hhmm(a.start_min ?? 840)}" required></label>
        <label><span class="lbl">Hasta</span><input class="field" type="time" step="300" name="to" value="${hhmm(a.end_min ?? 900)}" required></label>
      </div>
      ${staffOpts.length > 1 ? `<label><span class="lbl">Profesional</span><select class="field" name="staff_id">${staffOpts.map((s) => `<option value="${s.id}"${s.id === a.staff_id ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>` : ""}
      <label><span class="lbl">Motivo <small>· opcional</small></span><input class="field" name="notes" value="${esc(a.notes || "")}" placeholder="Ej.: médico"></label>
      <p class="form-error" role="alert" hidden></p>
      <div class="dlg-foot"><button class="btn btn-rose wide" type="submit">Guardar bloqueo</button></div>
    </form>`);
}
async function saveBlock(form) {
  const f = new FormData(form);
  const from = toMin(f.get("from")), to = toMin(f.get("to"));
  if (!(to > from)) return formError("La hora de fin tiene que ser después del inicio.");
  const prev = D().appointments.find((a) => a.id === form.dataset.id);
  await run(async () => {
    await save("appointments", {
      id: prev?.id || uid(), kind: "block", client_id: null, client_name: null, client_phone: null,
      staff_id: f.get("staff_id") || activeStaff()[0]?.id || null, date: f.get("date"), start_min: from, end_min: to,
      items: [], total: 0, status: "confirmed", notes: (f.get("notes") || "").trim() || null, source: "panel",
      created_at: prev?.created_at || new Date().toISOString(),
    });
    closeDlg(); render();
  }, "Horario bloqueado ✓");
}

/* ---- Servicios ---- */
VIEWS.servicios = () => {
  const cats = [...D().categories].sort(bySort);
  const svcs = [...D().services].sort(bySort);
  const groups = [...cats.map((c) => [c, svcs.filter((s) => s.category_id === c.id)]), [{ id: "", name: "Sin categoría" }, svcs.filter((s) => !cats.some((c) => c.id === s.category_id))]];
  return `
    <div class="page-head"><h1>Servicios</h1><button class="btn btn-rose sm" type="button" data-act="svc-new">${ic("plus")}Nuevo</button></div>
    <p class="hint">Lo que está activo aparece en la página de reservas con su precio y duración. Sin precio se muestra "Consultar".</p>
    <div class="row"><button class="btn btn-ghost sm" type="button" data-act="cats">${ic("sliders")}Categorías</button>
      <button class="btn btn-ghost sm" type="button" data-act="addons">${ic("plus")}Adicionales <small class="muted">${(D().addons || []).length}</small></button></div>
    ${groups.filter(([c, l]) => l.length || c.id).map(([c, list]) => `
      <h2 class="grp">${esc(c.name)} <small>${list.length}</small></h2>
      <div class="list">${list.length ? list.map((s, i) => `
        <div class="svc-row${s.active ? "" : " off"}">
          ${s.image ? `<img src="${esc(s.image)}" alt="" loading="lazy">` : '<span class="ph"><svg class="sparkle"><use href="#i-sparkle"/></svg></span>'}
          <button type="button" class="svc-info" data-act="svc-edit" data-id="${s.id}">
            <b>${esc(s.name)}</b>
            ${s.description ? `<small class="desc">${esc(s.description)}</small>` : ""}
            <small><span class="price">${s.price != null ? gs(s.price) : "Consultar"}</span> · ${s.duration ? dur(s.duration) : "duración a confirmar"}${s.active ? "" : " · <em>oculto</em>"}</small>
          </button>
          <div class="svc-ctl">
            <label class="switch" title="Mostrar en la página de reservas"><input type="checkbox" data-change="svc-active" data-id="${s.id}"${s.active ? " checked" : ""} aria-label="Mostrar ${esc(s.name)} en la página"><span></span></label>
            <span class="updown">
              <button type="button" class="icon-btn xs" data-act="svc-move" data-id="${s.id}" data-v="-1" aria-label="Subir"${i === 0 ? " disabled" : ""}>${ic("up")}</button>
              <button type="button" class="icon-btn xs" data-act="svc-move" data-id="${s.id}" data-v="1" aria-label="Bajar"${i === list.length - 1 ? " disabled" : ""}>${ic("down")}</button>
            </span>
          </div>
        </div>`).join("") : '<p class="hint">Sin servicios en esta categoría.</p>'}</div>`).join("")}`;
};

function openService(s = null) {
  A.svcImage = s?.image || null;
  const cats = [...D().categories].sort(bySort);
  openDlg("service", s ? "Editar servicio" : "Nuevo servicio", `
    <form id="svc-form" data-id="${s?.id || ""}">
      <span class="lbl">Foto</span>
      <div class="photo-row">
        <div class="photo" id="svc-photo">${A.svcImage ? `<img src="${esc(A.svcImage)}" alt="">` : "sin foto"}</div>
        <div class="col">
          <label class="btn btn-ghost sm">Subir foto<input type="file" accept="image/*" id="svc-file" hidden></label>
          <button class="link-danger" type="button" data-act="svc-photo-rm"${A.svcImage ? "" : " hidden"}>Quitar foto</button>
        </div>
      </div>
      <label><span class="lbl">Nombre</span><input class="field" name="name" value="${esc(s?.name || "")}" required maxlength="80" ${s ? "" : "autofocus"}></label>
      <label><span class="lbl">Descripción <small>· opcional</small></span><textarea class="field" name="description" rows="2" maxlength="300">${esc(s?.description || "")}</textarea></label>
      <label><span class="lbl">Categoría</span><select class="field" name="category_id">${cats.map((c) => `<option value="${c.id}"${c.id === s?.category_id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
      <div class="two">
        <label><span class="lbl">Precio (Gs.)</span><input class="field" name="price" inputmode="numeric" value="${fmtNum(s?.price ?? null)}" placeholder="Vacío = Consultar" data-money></label>
        <label><span class="lbl">Duración (min)</span><input class="field" name="duration" inputmode="numeric" value="${s?.duration ?? ""}" placeholder="Ej.: 60"></label>
      </div>
      <label class="check"><input type="checkbox" name="active"${!s || s.active ? " checked" : ""}> Mostrar en la página de reservas</label>
      ${D().staff.filter((st) => st.active).length > 1 ? `<span class="lbl">¿Quién lo hace?</span>
        <div class="checks">${D().staff.filter((st) => st.active).sort(bySort).map((st) => `<label class="check">
          <input type="checkbox" name="who" value="${st.id}"${!st.service_ids || (s ? st.service_ids.includes(s.id) : false) ? " checked" : ""}${st.service_ids ? "" : " disabled"}>
          ${esc(st.name)}${st.service_ids ? "" : " <small class=\"muted\">(hace todos)</small>"}</label>`).join("")}</div>` : ""}
      <p class="form-error" role="alert" hidden></p>
      <div class="dlg-foot"><button class="btn btn-rose wide" type="submit">Guardar</button></div>
      ${s ? `<button class="link-danger" type="button" data-act="svc-delete" data-id="${s.id}">${ic("trash")}Eliminar servicio</button>` : ""}
    </form>`);
}
async function saveService(form) {
  const f = new FormData(form);
  const name = f.get("name").trim();
  if (!name) return formError("Poné un nombre.");
  const prev = svcById(form.dataset.id);
  const catId = f.get("category_id") || null;
  const who = form.querySelector('[name="who"]') ? f.getAll("who") : null;
  await run(async () => {
    const sv = await save("services", {
      id: prev?.id || uid(), category_id: catId, name, description: f.get("description").trim() || null,
      price: num(f.get("price")), duration: num(f.get("duration")) || null, image: A.svcImage,
      active: f.get("active") === "on",
      sort: prev?.sort ?? Math.max(-1, ...D().services.map((x) => x.sort ?? 0)) + 1,
    });
    // keep each professional's list in step with "¿Quién lo hace?"
    if (who) {
      for (const st of D().staff.filter((x) => x.active && x.service_ids)) {
        const has = st.service_ids.includes(sv.id), want = who.includes(st.id);
        if (has !== want) await save("staff", { ...st, service_ids: want ? [...st.service_ids, sv.id] : st.service_ids.filter((id) => id !== sv.id) });
      }
    }
    closeDlg(); render();
  }, "Servicio guardado ✓");
}

function openCategories() {
  const cats = [...D().categories].sort(bySort);
  const n = (id) => D().services.filter((s) => s.category_id === id).length;
  openDlg("cats", "Categorías", `
    <p class="hint">Así se agrupan los servicios en la página. Cambiá el nombre y tocá afuera para guardar.</p>
    <div class="list">${cats.map((c, i) => `
      <div class="cat-row">
        <input class="field" value="${esc(c.name)}" data-change="cat-name" data-id="${c.id}" aria-label="Nombre de la categoría">
        <small class="muted">${n(c.id)}</small>
        <button type="button" class="icon-btn xs" data-act="cat-move" data-id="${c.id}" data-v="-1" aria-label="Subir"${i ? "" : " disabled"}>${ic("up")}</button>
        <button type="button" class="icon-btn xs" data-act="cat-move" data-id="${c.id}" data-v="1" aria-label="Bajar"${i < cats.length - 1 ? "" : " disabled"}>${ic("down")}</button>
        <button type="button" class="icon-btn xs danger" data-act="cat-delete" data-id="${c.id}" aria-label="Eliminar ${esc(c.name)}">${ic("trash")}</button>
      </div>`).join("")}</div>
    <form id="cat-form" class="row mt"><input class="field" name="name" placeholder="Nueva categoría" required maxlength="40"><button class="btn btn-rose sm" type="submit">Agregar</button></form>`);
}

async function move(table, id, delta, siblings) {
  const list = siblings.sort(bySort);
  const i = list.findIndex((x) => x.id === id), j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  // renumber this group, keeping it after/before the others
  const base = Math.min(...list.map((x) => x.sort ?? 0));
  await run(() => Promise.all(list.map((x, k) => (x.sort === base + k ? null : save(table, { ...x, sort: base + k })))));
}

/* ---- Adicionales (francesitas, largor...) ---- */
function openAddons() {
  const cats = Object.fromEntries(D().categories.map((c) => [c.id, c.name]));
  const list = [...(D().addons || [])].sort(bySort);
  openDlg("addons", "Adicionales", `
    <p class="hint">Extras que la clienta puede sumar a un servicio al reservar. Se suman al precio y al tiempo.</p>
    <div class="list">${list.length ? list.map((a) => `
      <button type="button" class="c-row${a.active ? "" : " off"}" data-act="addon-edit" data-id="${a.id}">
        <span class="c-main"><b>${esc(a.name)}</b>
          <small>+ ${gs(a.price)}${a.duration ? ` · ${dur(a.duration)}` : ""} · ${a.category_ids ? a.category_ids.map((c) => esc(cats[c] || c)).join(", ") : "todos los servicios"}${a.active ? "" : " · oculto"}</small></span>
        ${ic("right")}</button>`).join("") : empty("Todavía no hay adicionales.")}</div>
    <div class="dlg-foot"><button class="btn btn-rose wide" type="button" data-act="addon-new">${ic("plus")}Nuevo adicional</button></div>`);
}
function openAddon(a = null) {
  const cats = [...D().categories].sort(bySort);
  openDlg("addon", a ? "Editar adicional" : "Nuevo adicional", `
    <form id="addon-form" data-id="${a?.id || ""}">
      <label><span class="lbl">Nombre</span><input class="field" name="name" value="${esc(a?.name || "")}" required maxlength="80" placeholder="Ej.: Francesitas" ${a ? "" : "autofocus"}></label>
      <div class="two">
        <label><span class="lbl">Precio (Gs.)</span><input class="field" name="price" inputmode="numeric" data-money value="${fmtNum(a?.price ?? null)}" placeholder="0"></label>
        <label><span class="lbl">Tiempo extra (min)</span><input class="field" name="duration" inputmode="numeric" value="${a?.duration || ""}" placeholder="0"></label>
      </div>
      <span class="lbl">Se ofrece con</span>
      <div class="checks">${cats.map((c) => `<label class="check"><input type="checkbox" name="cat" value="${c.id}"${a?.category_ids?.includes(c.id) ? " checked" : ""}> ${esc(c.name)}</label>`).join("")}</div>
      <p class="hint">Si no marcás ninguna, se ofrece con todos los servicios.</p>
      <label class="check"><input type="checkbox" name="active"${!a || a.active ? " checked" : ""}> Mostrar en la página de reservas</label>
      <p class="form-error" role="alert" hidden></p>
      <div class="dlg-foot"><button class="btn btn-rose wide" type="submit">Guardar</button></div>
      ${a ? `<button class="link-danger" type="button" data-act="addon-delete" data-id="${a.id}">${ic("trash")}Eliminar adicional</button>` : ""}
    </form>`);
}
async function saveAddon(form) {
  const f = new FormData(form);
  const name = f.get("name").trim();
  if (!name) return formError("Poné un nombre.");
  const prev = (D().addons || []).find((x) => x.id === form.dataset.id);
  const cats = f.getAll("cat");
  await run(async () => {
    await save("addons", {
      id: prev?.id || uid(), name, price: num(f.get("price")) || 0, duration: num(f.get("duration")) || 0,
      category_ids: cats.length ? cats : null, active: f.get("active") === "on",
      sort: prev?.sort ?? Math.max(0, ...(D().addons || []).map((x) => x.sort ?? 0)) + 1,
    });
    openAddons(); render();
  }, "Adicional guardado ✓");
}

/* ---- Galería ---- */
const byOrder = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);
VIEWS.galeria = () => {
  const list = [...(D().gallery || [])].sort(byOrder);
  return `
    <div class="page-head"><h1>Galería</h1>
      <label class="btn btn-rose sm">${ic("plus")}Subir fotos<input type="file" accept="image/*" multiple id="gal-file" hidden></label></div>
    <p class="hint">Son las fotos de «Trabajos recientes» en la página del salón. Las nuevas aparecen primero; ordenalas con las flechas.</p>
    ${list.length ? `<div class="gal-grid">${list.map((g, i) => `
      <figure class="gal-item${g.active ? "" : " off"}">
        <img src="${esc(g.image)}" alt="${esc(g.caption || "")}" loading="lazy">
        <input class="field sm" value="${esc(g.caption || "")}" placeholder="¿Qué es?" maxlength="60" data-change="gal-caption" data-id="${g.id}" aria-label="Descripción de la foto">
        <div class="gal-ctl">
          <button type="button" class="icon-btn xs" data-act="gal-move" data-id="${g.id}" data-v="-1" aria-label="Mover antes"${i ? "" : " disabled"}>${ic("left")}</button>
          <button type="button" class="icon-btn xs" data-act="gal-move" data-id="${g.id}" data-v="1" aria-label="Mover después"${i < list.length - 1 ? "" : " disabled"}>${ic("right")}</button>
          <label class="switch" title="Mostrar en la página"><input type="checkbox" data-change="gal-active" data-id="${g.id}"${g.active ? " checked" : ""} aria-label="Mostrar en la página"><span></span></label>
          <button type="button" class="icon-btn xs danger" data-act="gal-delete" data-id="${g.id}" aria-label="Eliminar foto">${ic("trash")}</button>
        </div>
      </figure>`).join("")}</div>` : empty("Todavía no hay fotos. Subí las primeras.")}`;
};
async function uploadGallery(files) {
  const list = [...files].filter((f) => f.type.startsWith("image/"));
  let first = Math.min(0, ...(D().gallery || []).map((g) => g.sort ?? 0));
  let done = 0;
  for (let i = 0; i < list.length; i++) {
    toast(`Subiendo ${i + 1} de ${list.length}…`, 60000);
    const ok = await run(async () => {
      const image = await A.db.uploadImage(list[i], "gallery");
      await save("gallery", { id: uid(), image, caption: null, active: true, sort: --first });
      return true;
    });
    if (!ok) break; // run() already showed the error
    done++;
  }
  if (done === list.length) toast(done === 1 ? "Foto subida ✓" : `${done} fotos subidas ✓`);
  render();
}

/* ---- Clientas ---- */
VIEWS.clientas = () => {
  const due = dueClients().length;
  return `
    <div class="page-head"><h1>Clientas</h1><button class="btn btn-rose sm" type="button" data-act="client-new">${ic("plus")}Nueva</button></div>
    <input class="field" type="search" id="c-search" value="${esc(A.clients.q)}" placeholder="Buscar por nombre o número" aria-label="Buscar clienta">
    <div class="chips-row">
      <button type="button" class="chip" data-act="clients-filter" data-v="todas" aria-current="${A.clients.filter === "todas"}">Todas · ${D().clients.length}</button>
      <button type="button" class="chip" data-act="clients-filter" data-v="volver" aria-current="${A.clients.filter === "volver"}">Para volver a agendar · ${due}</button>
    </div>
    <div class="list" id="c-list"></div>`;
};
AFTER.clientas = () => paintClients();
function paintClients() {
  const q = A.clients.q.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  let list = A.clients.filter === "volver" ? dueClients() : [...D().clients].sort((a, b) => a.name.localeCompare(b.name));
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || (digits.length > 2 && (c.phone || "").includes(digits)));
  $("#c-list").innerHTML = list.length ? list.map((c) => {
    const st = cstats(c);
    const nb = nextBday(c.birthday);
    const line = st.next ? `Próximo turno: ${relDay(st.next.date)} ${hhmm(st.next.start_min)}` : st.last ? `Última visita: hace ${st.since} día${st.since === 1 ? "" : "s"}` : "Sin visitas todavía";
    return `<a class="c-row" href="#/clienta/${c.id}">
      <span class="avatar">${esc(c.name.trim()[0] || "?")}</span>
      <span class="c-main"><b>${esc(c.name)}</b><small>${fmtPhone(c.phone) || "Sin WhatsApp"}</small><small>${line}</small></span>
      ${nb && nb.days >= 0 && nb.days <= BDAY_DAYS ? `<span class="badge">🎂 ${nb.days === 0 ? "Hoy" : shortDate(nb.key)}</span>` : ""}
      ${st.due ? '<span class="badge b-due">Toca volver</span>' : ""}${ic("right")}</a>`;
  }).join("") : empty(q ? "No encontramos a nadie con esa búsqueda." : A.clients.filter === "volver" ? "Nadie para recordar por ahora." : "Todavía no hay clientas. Se agregan solas cuando reservan, o con «Nueva».");
}

VIEWS.clienta = (id) => {
  const c = clientById(id);
  if (!c) return `<a class="back" href="#/clientas">${ic("left")}Clientas</a>${empty("No encontramos esa clienta.")}`;
  const st = cstats(c);
  const nb = nextBday(c.birthday);
  const hist = D().appointments.filter((a) => a.client_id === c.id).sort((a, b) => byTime(b, a));
  return `
    <a class="back" href="#/clientas">${ic("left")}Clientas</a>
    <div class="c-head"><span class="avatar lg">${esc(c.name.trim()[0] || "?")}</span><div><h1>${esc(c.name)}</h1><p class="muted">${fmtPhone(c.phone) || "Sin WhatsApp"}${c.birthday ? ` · 🎂 ${bdayText(c.birthday)}` : ""}</p></div></div>
    <div class="row">
      ${c.phone ? `<a class="btn btn-wa sm" href="${waLink(`¡Hola ${c.name.split(" ")[0]}! 🌸`, c.phone)}" target="_blank" rel="noopener">${wa}WhatsApp</a>` : ""}
      <button class="btn btn-rose sm" type="button" data-act="client-book" data-id="${c.id}">${ic("plus")}Agendar cita</button>
      <button class="btn btn-ghost sm" type="button" data-act="client-edit" data-id="${c.id}">${ic("edit")}Editar</button>
      ${c.birthday ? "" : `<button class="btn btn-ghost sm" type="button" data-act="client-edit" data-id="${c.id}" data-focus="bday_d">🎂 Agregar cumpleaños</button>`}
      ${c.phone && st.visits && D().settings.review_url ? `<a class="btn btn-ghost sm" href="${waLink(reviewMsg(c), c.phone)}" target="_blank" rel="noopener" data-act="review-ask" data-id="${c.id}">${ic("star")}${c.review_requested_at ? `Reseña pedida el ${shortDate(c.review_requested_at)}` : "Pedir reseña"}</a>` : ""}
    </div>
    ${nb && nb.days <= BDAY_DAYS ? `<div class="remind">
      <p><span aria-hidden="true">🎂</span><span><b>${bdayWhen(nb)}</b><small>${bdayGreeted(c, nb) ? "Ya la saludaste. " : ""}Regalo: ${esc(D().settings.birthday_gift)} en su próximo turno.</small></span></p>
      <div class="row">${bdayButton(c, nb)}</div>
    </div>` : ""}
    ${st.due ? `<div class="remind">
      <p>${ic("bell")}<span><b>Hace ${st.since} días de su última visita</b><small>Mandale un mensaje para que vuelva a reservar.</small></span></p>
      <div class="row">${c.phone ? `<a class="btn btn-wa sm" href="${waLink(reminderText(D(), c, st.since), c.phone)}" target="_blank" rel="noopener" data-act="remind" data-id="${c.id}">${wa}Enviar recordatorio</a>` : ""}
        <button class="btn btn-ghost sm" type="button" data-act="remind" data-id="${c.id}">Ya le escribí</button></div>
    </div>` : st.reminded ? `<p class="hint">Ya le mandaste el recordatorio.</p>` : ""}
    <div class="stats four">
      <div class="stat"><b>${st.visits}</b><small>Visitas</small></div>
      <div class="stat"><b>${gs(st.spent)}</b><small>Total</small></div>
      <div class="stat"><b>${st.last ? `hace ${st.since} d` : "—"}</b><small>Última visita</small></div>
      <div class="stat"><b>${st.next ? relDay(st.next.date) : "—"}</b><small>Próximo turno</small></div>
    </div>
    ${section("Notas", `<textarea class="field" id="c-notes" rows="3" placeholder="Alergias, preferencias, diseños que le gustan…">${esc(c.notes || "")}</textarea>
      <button class="btn btn-ghost sm mt" type="button" data-act="client-notes" data-id="${c.id}">Guardar nota</button>`)}
    ${section("Historial", hist.length ? `<div class="list">${hist.map((a) => apptCard(a, { date: true })).join("")}</div>` : empty("Sin citas todavía."))}`;
};

function openClient(c = null, focus = "name") {
  const [bm, bd] = c?.birthday ? c.birthday.split("-").map(Number) : [0, 0];
  openDlg("client", c ? "Editar clienta" : "Nueva clienta", `
    <form id="client-form" data-id="${c?.id || ""}">
      <label><span class="lbl">Nombre</span><input class="field" name="name" value="${esc(c?.name || "")}" required maxlength="80"${focus === "name" ? " autofocus" : ""}></label>
      <label><span class="lbl">WhatsApp</span><input class="field" name="phone" type="tel" inputmode="tel" value="${esc(fmtPhone(c?.phone))}" placeholder="Ej.: 0981 123 456"></label>
      <span class="lbl">Cumpleaños <small>· opcional, sin el año</small></span>
      <div class="two">
        <select class="field" name="bday_d" aria-label="Día del cumpleaños"${focus === "bday_d" ? " autofocus" : ""}><option value="">Día</option>${Array.from({ length: 31 }, (_, i) => `<option${bd === i + 1 ? " selected" : ""}>${i + 1}</option>`).join("")}</select>
        <select class="field" name="bday_m" aria-label="Mes del cumpleaños"><option value="">Mes</option>${MONTHS.map((n, i) => `<option value="${i + 1}"${bm === i + 1 ? " selected" : ""}>${n}</option>`).join("")}</select>
      </div>
      <label><span class="lbl">Notas <small>· opcional</small></span><textarea class="field" name="notes" rows="3">${esc(c?.notes || "")}</textarea></label>
      <p class="form-error" role="alert" hidden></p>
      <div class="dlg-foot"><button class="btn btn-rose wide" type="submit">Guardar</button></div>
      ${c ? `<button class="link-danger" type="button" data-act="client-delete" data-id="${c.id}">${ic("trash")}Eliminar clienta</button>` : ""}
    </form>`);
}
async function saveClient(form) {
  const f = new FormData(form);
  const name = f.get("name").trim();
  const phone = normPhone(f.get("phone"));
  if (!name) return formError("Poné el nombre.");
  if (f.get("phone").trim() && (phone.length < 8 || phone.length > 15)) return formError("Revisá el número de WhatsApp.");
  const bd = +f.get("bday_d"), bm = +f.get("bday_m");
  if (!bd !== !bm) return formError("Para el cumpleaños elegí el día y el mes.");
  if (bd > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][bm - 1]) return formError(`El ${bd} de ${MONTHS[bm - 1]} no existe. Revisá el cumpleaños.`);
  const prev = clientById(form.dataset.id);
  await run(async () => {
    const c = await save("clients", { ...(prev || { id: uid(), reminded_at: null, created_at: new Date().toISOString() }), name, phone: phone || null,
      birthday: bd ? `${pad(bm)}-${pad(bd)}` : null, notes: f.get("notes").trim() || null });
    // keep her name and number in sync on her appointments
    if (prev) {
      await Promise.all(D().appointments.filter((a) => a.client_id === c.id && (a.client_name !== name || (phone && a.client_phone !== phone)))
        .map((a) => save("appointments", { ...a, client_name: name, client_phone: phone || a.client_phone })));
    }
    closeDlg();
    if (prev) render(); else location.hash = `#/clienta/${c.id}`;
  }, "Clienta guardada ✓");
}

/* ---- Horarios ---- */
function hoursEditor(hours, id) {
  return `<div class="hours-ed" id="${id}">${[1, 2, 3, 4, 5, 6, 0].map((d) => {
    const b = (hours[d] || []).slice().sort((x, y) => x[0] - y[0]);
    const on = b.length > 0, pause = b.length > 1;
    const start = on ? b[0][0] : 480, end = on ? b.at(-1)[1] : 1140;
    const ps = pause ? b[0][1] : 720, pe = pause ? b[1][0] : 840;
    return `<div class="day-ed${on ? "" : " off"}" data-d="${d}">
      <div class="day-top"><b>${DAYS[d]}</b><span class="muted small">${on ? "" : "Cerrado"}</span>
        <label class="switch"><input type="checkbox" data-h="on"${on ? " checked" : ""} aria-label="Atiende el ${DAYS[d].toLowerCase()}"><span></span></label></div>
      <div class="day-body">
        <div class="two">
          <label><span class="lbl">Primer turno</span><input class="field" type="time" step="300" data-h="start" value="${hhmm(start)}"></label>
          <label><span class="lbl">Último turno</span><input class="field" type="time" step="300" data-h="end" value="${hhmm(end)}"></label>
        </div>
        <label class="check"><input type="checkbox" data-h="pause"${pause ? " checked" : ""}> Pausa</label>
        <div class="two pause"${pause ? "" : " hidden"}>
          <label><span class="lbl">Pausa inicio</span><input class="field" type="time" step="300" data-h="ps" value="${hhmm(ps)}"></label>
          <label><span class="lbl">Pausa fin</span><input class="field" type="time" step="300" data-h="pe" value="${hhmm(pe)}"></label>
        </div>
      </div>
    </div>`;
  }).join("")}</div>`;
}
function readHours(root) {
  const hours = [[], [], [], [], [], [], []];
  for (const el of $$(".day-ed", root)) {
    const d = +el.dataset.d;
    const v = (k) => $(`[data-h="${k}"]`, el);
    if (!v("on").checked) continue;
    const s = toMin(v("start").value), e = toMin(v("end").value);
    if (!v("start").value || !v("end").value || s >= e) return { error: `${DAYS[d]}: el último turno tiene que ser después del primero.` };
    if (v("pause").checked) {
      const ps = toMin(v("ps").value), pe = toMin(v("pe").value);
      if (!(s < ps && ps < pe && pe < e)) return { error: `${DAYS[d]}: la pausa tiene que quedar dentro del horario.` };
      hours[d] = [[s, ps], [pe, e]];
    } else hours[d] = [[s, e]];
  }
  return { hours };
}

VIEWS.horarios = () => {
  const s = D().settings;
  const opt = (v, cur, label) => `<option value="${v}"${+cur === v ? " selected" : ""}>${label}</option>`;
  return `
    <div class="page-head"><h1>Horarios</h1></div>
    <p class="hint">Definí cuándo atendés. «Último turno» es la última hora a la que se puede reservar, aunque el servicio termine después. Antes de la pausa, el turno tiene que terminar a tiempo. Para feriados o vacaciones usá <a href="#/especiales">Días especiales</a>.</p>
    <form id="hours-form">
      ${hoursEditor(s.hours, "h-salon")}
      ${section("Reservas online", `
        <div class="card-ed">
          <label><span class="lbl">Se puede reservar con hasta</span>
            <select class="field" name="booking_days">${[7, 14, 21, 30, 45, 60, 90].map((v) => opt(v, s.booking_days, `${v} días de anticipación`)).join("")}</select></label>
          <label><span class="lbl">Turnos cada</span>
            <select class="field" name="slot_step">${[15, 20, 30, 45, 60].map((v) => opt(v, s.slot_step, `${v} minutos`)).join("")}</select></label>
          <label><span class="lbl">Para reservar el mismo día, avisar con</span>
            <select class="field" name="min_notice">${[[0, "Sin mínimo"], [30, "30 minutos"], [60, "1 hora"], [120, "2 horas"], [180, "3 horas"], [1440, "No se reserva para el mismo día"]].map(([v, l]) => opt(v, s.min_notice, l)).join("")}</select></label>
          <label><span class="lbl">Servicios sin duración cargada ocupan</span>
            <select class="field" name="default_duration">${[30, 45, 60, 90, 120].map((v) => opt(v, s.default_duration, dur(v))).join("")}</select></label>
          <label class="check"><input type="checkbox" name="auto_confirm"${s.auto_confirm ? " checked" : ""}> Confirmar las reservas automáticamente</label>
          <p class="hint">Si lo apagás, las reservas de la web quedan «por confirmar» hasta que las aceptes. Igual ocupan el horario.</p>
        </div>`)}
      <p class="form-error" role="alert" hidden></p>
      <div class="sticky-foot"><button class="btn btn-rose wide" type="submit">Guardar horarios</button></div>
    </form>`;
};

/* ---- Días especiales ---- */
VIEWS.especiales = () => {
  const today = nowInSalon().key;
  const list = D().exceptions.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const who = (id) => (id ? staffById(id)?.name || "—" : "Todo el salón");
  return `
    <div class="page-head"><h1>Días especiales</h1><button class="btn btn-rose sm" type="button" data-act="special-new">${ic("plus")}Agregar</button></div>
    <p class="hint">Feriados, vacaciones o días con otro horario. Le ganan al horario de siempre.</p>
    <div class="list">${list.length ? list.map((e) => `
      <div class="sp-row">
        <span class="sp-date"><b>${+e.date.slice(8)}</b><small>${MONTHS[+e.date.slice(5, 7) - 1].slice(0, 3)}</small></span>
        <span class="c-main"><b>${DAYS[dowOf(e.date)]}${e.note ? ` · ${esc(e.note)}` : ""}</b>
          <small>${e.blocks.length ? e.blocks.map(([o, c]) => `${hhmm(o)}–${hhmm(c)}`).join(" y ") : "Cerrado"}${multi() || e.staff_id ? ` · ${esc(who(e.staff_id))}` : ""}</small></span>
        <button type="button" class="icon-btn xs danger" data-act="special-delete" data-id="${e.id}" aria-label="Quitar">${ic("trash")}</button>
      </div>`).join("") : empty("No hay días especiales cargados.")}</div>`;
};

function openSpecial() {
  const today = nowInSalon().key;
  const staffOpts = activeStaff();
  openDlg("special", "Día especial", `
    <form id="special-form">
      <div class="two">
        <label><span class="lbl">Desde</span><input class="field" type="date" name="from" value="${today}" min="${today}" required></label>
        <label><span class="lbl">Hasta <small>· opcional</small></span><input class="field" type="date" name="to" min="${today}"></label>
      </div>
      ${staffOpts.length > 1 ? `<label><span class="lbl">Para</span><select class="field" name="staff_id"><option value="">Todo el salón</option>${staffOpts.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>` : ""}
      <span class="lbl">¿Qué pasa ese día?</span>
      <div class="seg">
        <label><input type="radio" name="type" value="closed" checked><span>Cerrado</span></label>
        <label><input type="radio" name="type" value="hours"><span>Otro horario</span></label>
      </div>
      <div class="sp-hours" hidden>
        <div class="two">
          <label><span class="lbl">Primer turno</span><input class="field" type="time" step="300" name="start" value="08:00"></label>
          <label><span class="lbl">Último turno</span><input class="field" type="time" step="300" name="end" value="12:00"></label>
        </div>
        <label class="check"><input type="checkbox" name="pause"> Pausa</label>
        <div class="two pause" hidden>
          <label><span class="lbl">Pausa inicio</span><input class="field" type="time" step="300" name="ps" value="12:00"></label>
          <label><span class="lbl">Pausa fin</span><input class="field" type="time" step="300" name="pe" value="14:00"></label>
        </div>
      </div>
      <label><span class="lbl">Motivo <small>· opcional</small></span><input class="field" name="note" placeholder="Ej.: feriado, vacaciones" maxlength="60"></label>
      <p class="form-error" role="alert" hidden></p>
      <div class="dlg-foot"><button class="btn btn-rose wide" type="submit">Guardar</button></div>
    </form>`);
}
async function saveSpecial(form) {
  const f = new FormData(form);
  const from = f.get("from"), to = f.get("to") || from;
  if (!from) return formError("Elegí la fecha.");
  if (to < from) return formError("La fecha «hasta» tiene que ser después de «desde».");
  if (daysBetween(from, to) > 90) return formError("Elegí un rango de hasta 3 meses.");
  let blocks = [];
  if (f.get("type") === "hours") {
    const s = toMin(f.get("start")), e = toMin(f.get("end"));
    if (!(e > s)) return formError("El último turno tiene que ser después del primero.");
    if (f.get("pause")) {
      const ps = toMin(f.get("ps")), pe = toMin(f.get("pe"));
      if (!(s < ps && ps < pe && pe < e)) return formError("La pausa tiene que quedar dentro del horario.");
      blocks = [[s, ps], [pe, e]];
    } else blocks = [[s, e]];
  }
  const staff = f.get("staff_id") || null;
  const dates = Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i));
  const affected = D().appointments.filter((a) => a.kind !== "block" && live(a) && dates.includes(a.date) && (!staff || a.staff_id === staff)
    && !(blocks.some(([o, c]) => a.start_min >= o && a.end_min <= c)));
  if (affected.length && !confirm(`Ojo: hay ${affected.length} cita${affected.length === 1 ? "" : "s"} en esos días fuera del nuevo horario. No se cancelan solas: avisales y cancelalas desde la agenda.\n\n¿Guardar igual?`)) return;
  await run(async () => {
    for (const date of dates) {
      for (const old of D().exceptions.filter((e) => e.date === date && (e.staff_id || null) === staff)) await remove("exceptions", old.id);
      await save("exceptions", { id: uid(), date, staff_id: staff, blocks, note: f.get("note").trim() || null });
    }
    closeDlg(); render();
  }, dates.length > 1 ? `${dates.length} días guardados ✓` : "Día guardado ✓");
}

/* ---- Profesionales ---- */
VIEWS.equipo = () => `
  <div class="page-head"><h1>Profesionales</h1><button class="btn btn-rose sm" type="button" data-act="staff-new">${ic("plus")}Agregar</button></div>
  <p class="hint">Cada profesional tiene marcados los servicios que hace. Si la clienta elige servicios de dos profesionales, la página arma turnos seguidos: primero con una y después con la otra. Cuando una sola hace todo y hay más de una disponible, pregunta «¿Con quién?».</p>
  ${(() => {
    const orphan = uncovered();
    const people = D().staff.filter((s) => s.active && s.service_ids).sort(bySort);
    return orphan.length ? `<div class="remind">
      <p>${ic("bell")}<span><b>${orphan.length} servicio${orphan.length === 1 ? "" : "s"} sin profesional</b><small>No se pueden reservar hasta que alguien los tenga: ${orphan.map((x) => esc(x.name)).join(", ")}.</small></span></p>
      <div class="row">${people.map((st) => `<button class="btn btn-rose sm" type="button" data-act="staff-take" data-id="${st.id}">Los hace ${esc(firstName(st.name))}</button>`).join("")}</div>
    </div>` : "";
  })()}
  <div class="list">${[...D().staff].sort(bySort).map((s) => `
    <button type="button" class="c-row${s.active ? "" : " off"}" data-act="staff-edit" data-id="${s.id}">
      <span class="avatar">${esc(s.name.trim()[0] || "?")}</span>
      <span class="c-main"><b>${esc(s.name)}${s.active ? "" : " · inactiva"}</b><small>${esc(s.role || "")}</small>
        <small>${s.service_ids ? `${s.service_ids.length} servicio${s.service_ids.length === 1 ? "" : "s"}` : "Todos los servicios"} · ${s.hours ? "horario propio" : "horario del salón"}</small></span>
      ${ic("right")}</button>`).join("")}</div>`;

function openStaff(s = null) {
  const cats = [...D().categories].sort(bySort);
  const svcs = [...D().services].sort(bySort);
  const has = (id) => !s?.service_ids || s.service_ids.includes(id);
  openDlg("staff", s ? "Editar profesional" : "Nueva profesional", `
    <form id="staff-form" data-id="${s?.id || ""}">
      <label><span class="lbl">Nombre</span><input class="field" name="name" value="${esc(s?.name || "")}" required maxlength="40" ${s ? "" : "autofocus"}></label>
      <label><span class="lbl">Qué hace <small>· opcional</small></span><input class="field" name="role" value="${esc(s?.role || "")}" placeholder="Ej.: Manicurista, Peluquera" maxlength="40"></label>
      <label class="check"><input type="checkbox" name="active"${!s || s.active ? " checked" : ""}> Activa: aparece para reservar</label>
      <span class="lbl">Servicios</span>
      <label class="check"><input type="checkbox" name="all" data-toggle="#st-svcs"${!s?.service_ids ? " checked" : ""}> Hace todos los servicios</label>
      <div id="st-svcs" class="checks"${!s?.service_ids ? " hidden" : ""}>
        ${cats.map((c) => { const l = svcs.filter((x) => x.category_id === c.id); return l.length ? `<p class="picker-cat">${esc(c.name)}</p>${l.map((x) => `<label class="check"><input type="checkbox" name="svc" value="${x.id}"${has(x.id) ? " checked" : ""}> ${esc(x.name)}</label>`).join("")}` : ""; }).join("")}
      </div>
      <span class="lbl">Horario</span>
      <label class="check"><input type="checkbox" name="own" data-toggle="#st-hours"${s?.hours ? " checked" : ""}> Tiene su propio horario</label>
      <div id="st-hours"${s?.hours ? "" : " hidden"}>${hoursEditor(s?.hours || D().settings.hours, "h-staff")}</div>
      <p class="form-error" role="alert" hidden></p>
      <div class="dlg-foot"><button class="btn btn-rose wide" type="submit">Guardar</button></div>
      ${s ? `<button class="link-danger" type="button" data-act="staff-delete" data-id="${s.id}">${ic("trash")}Eliminar profesional</button>` : ""}
    </form>`, { wide: true });
}
async function saveStaff(form) {
  const f = new FormData(form);
  const name = f.get("name").trim();
  if (!name) return formError("Poné el nombre.");
  const prev = staffById(form.dataset.id);
  const active = f.get("active") === "on";
  if (!active && !D().staff.some((s) => s.active && s.id !== prev?.id)) return formError("Tiene que quedar al menos una profesional activa para recibir reservas.");
  let hours = null;
  if (f.get("own")) { const r = readHours($("#h-staff")); if (r.error) return formError(r.error); hours = r.hours; }
  const ids = f.getAll("svc");
  if (!f.get("all") && !ids.length) return formError("Elegí al menos un servicio, o marcá «Hace todos los servicios».");
  await run(async () => {
    await save("staff", {
      id: prev?.id || uid(), name, role: f.get("role").trim() || null, active,
      sort: prev?.sort ?? Math.max(-1, ...D().staff.map((x) => x.sort ?? 0)) + 1,
      hours, service_ids: f.get("all") ? null : ids,
    });
    closeDlg(); render();
  }, "Guardado ✓");
}

/* ---- Control financiero ---- */
VIEWS.finanzas = () => {
  const now = nowInSalon();
  A.month ||= now.key.slice(0, 7);
  const [y, m] = A.month.split("-").map(Number);
  const appts = D().appointments.filter((a) => a.kind !== "block" && a.date.startsWith(A.month));
  const done = appts.filter((a) => a.status === "confirmed" && isPast(a, now));
  const ahead = appts.filter((a) => live(a) && !isPast(a, now));
  // señas: money already received; the ones of cancelled or missed turns stay as income
  const withDep = appts.filter((a) => a.deposit > 0);
  const kept = withDep.filter((a) => OFF.includes(a.status));
  const depAhead = withDep.filter((a) => live(a) && !isPast(a, now));
  const income = sum(done, (a) => a.total) + sum(kept, (a) => a.deposit);
  // gastos of the month and what's left after them
  const exp = D().expenses.filter((x) => x.date.startsWith(A.month)).sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || "").localeCompare(a.created_at || ""));
  const spent = sum(exp, (x) => x.amount);
  const profit = income - spent;
  const repeat = fixedToRepeat();
  const byCat = [...exp.reduce((map, x) => { const t = map.get(x.category) || { label: x.category, n: 0, total: 0 }; t.n++; t.total += x.amount; return map.set(x.category, t); }, new Map()).values()]
    .sort((a, b) => b.total - a.total);
  const people = new Set(done.map((a) => a.client_id || a.client_name)).size;
  const tally = (key, val) => {
    const map = new Map();
    done.forEach((a) => key(a).forEach(([k, label, v]) => { const t = map.get(k) || { label, n: 0, total: 0 }; t.n++; t.total += v || 0; map.set(k, t); }));
    return [...map.values()].sort((a, b) => b.total - a.total || b.n - a.n);
  };
  const bySvc = tally((a) => a.items.map((i) => [i.service_id || i.name, i.name, i.price]));
  const byStaff = tally((a) => [[a.staff_id || "-", staffById(a.staff_id)?.name || "Sin asignar", a.total]]);
  const byDay = tally((a) => [[a.date, a.date, a.total]]).sort((a, b) => a.label.localeCompare(b.label));
  const max = Math.max(1, ...byDay.map((d) => d.total));
  const table = (rows) => `<div class="tbl">${rows.map((r) => `<div><span>${esc(r.label)}</span><small>${r.n}</small><b>${gs(r.total)}</b></div>`).join("")}</div>`;
  return `
    <div class="page-head"><h1>Control financiero</h1></div>
    <div class="monthbar">
      <button class="icon-btn sm" type="button" data-act="month" data-v="-1" aria-label="Mes anterior">${ic("left")}</button>
      <b>${MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1)} ${y}</b>
      <button class="icon-btn sm" type="button" data-act="month" data-v="1" aria-label="Mes siguiente">${ic("right")}</button>
    </div>
    <div class="stats money">
      <div class="stat big"><small>Ingresos</small><b>${gs(income)}</b><small>${done.length} cita${done.length === 1 ? "" : "s"} realizada${done.length === 1 ? "" : "s"}${kept.length ? ` + ${kept.length} seña${kept.length === 1 ? "" : "s"} que quedó` : ""}</small></div>
      <div class="stat big"><small>Gastos</small><b>${gs(spent)}</b><small>${exp.length} cargado${exp.length === 1 ? "" : "s"}</small></div>
      <div class="stat big profit${profit < 0 ? " neg" : ""}"><small>Ganancia real</small><b>${profit < 0 ? "− " : ""}${gs(Math.abs(profit))}</b><small>${profit < 0 ? "Este mes los gastos superan lo que entró" : income > 0 ? `Te queda el ${Math.round((profit / income) * 100)}% de lo que entró` : "Ingresos menos gastos"}</small></div>
    </div>
    <div class="stats">
      <div class="stat"><small>Señas cobradas</small><b>${gs(sum(withDep, (a) => a.deposit))}</b><small>${gs(sum(depAhead, (a) => a.deposit))} de turnos que vienen</small></div>
      <div class="stat"><small>Agendado</small><b>${gs(sum(ahead, (a) => a.total))}</b><small>${ahead.length} por venir</small></div>
      <div class="stat"><small>Ticket promedio</small><b>${gs(done.length ? income / done.length : 0)}</b><small>${people} clienta${people === 1 ? "" : "s"}</small></div>
      <div class="stat"><small>Canceladas · no vino</small><b>${appts.filter((a) => a.status === "cancelled").length} · ${appts.filter((a) => a.status === "no_show").length}</b><small>en el mes</small></div>
    </div>
    <p class="hint">Ingresos: las citas confirmadas que ya pasaron, con el precio cargado en cada una, más las señas de turnos cancelados o a los que no vino. Ganancia real: ingresos menos los gastos del mes.</p>
    ${section("Gastos", `
      ${repeat.length ? `<div class="row-link setup">${ic("calendar")}<span><b>${esc(repeat.map((x) => x.description || x.category).join(", "))}</b><small>Se repite${repeat.length === 1 ? "" : "n"} todos los meses · ${gs(sum(repeat, (x) => x.amount))} el mes pasado</small></span>
        <button class="btn btn-rose sm" type="button" data-act="exp-repeat">Cargar</button></div>` : ""}
      ${exp.length ? `<div class="list">${exp.map(expRow).join("")}</div>${byCat.length > 1 ? `<h3 class="day-h"><span>Por tipo</span></h3>${table(byCat)}` : ""}`
        : `<p class="hint">Cargá lo que gastás en el mes (materiales, alquiler, luz…) para ver cuánto te queda de verdad.</p>`}`,
      `<button class="btn btn-ghost sm" type="button" data-act="exp-new">${ic("plus")}Agregar gasto</button>`)}
    ${byDay.length ? section("Por día", `<div class="bars">${byDay.map((d) => `<div class="bar"><span>${DAYS_SHORT[dowOf(d.label)]} ${shortDate(d.label)}</span><i style="--w:${(d.total / max) * 100}%"></i><b>${gs(d.total)}</b></div>`).join("")}</div>`) : ""}
    ${bySvc.length ? section("Por servicio", table(bySvc)) : empty("Todavía no hay ingresos este mes.")}
    ${multi() && byStaff.length ? section("Por profesional", table(byStaff)) : ""}`;
};

const EXP_CATS = ["Materiales", "Alquiler", "Luz, agua e internet", "Sueldos y comisiones", "Publicidad", "Equipos y muebles", "Otros"];
const expRow = (x) => `<button type="button" class="c-row" data-act="exp-edit" data-id="${x.id}">
    <span class="r-time">${shortDate(x.date)}</span>
    <span class="c-main"><b>${esc(x.description || x.category)}</b><small>${x.description ? esc(x.category) : ""}${x.fixed ? `${x.description ? " · " : ""}todos los meses` : ""}</small></span>
    <b class="exp-amt">${gs(x.amount)}</b></button>`;

// fixed expenses (alquiler…) of last month that aren't loaded yet in the month on screen
function fixedToRepeat() {
  const [y, m] = A.month.split("-").map(Number);
  const prev = keyOf(new Date(Date.UTC(y, m - 2, 1))).slice(0, 7);
  const here = D().expenses.filter((x) => x.date.startsWith(A.month));
  return D().expenses.filter((x) => x.fixed && x.date.startsWith(prev)
    && !here.some((h) => h.category === x.category && (h.description || "") === (x.description || "")));
}

function openExpense(x = null) {
  const now = nowInSalon();
  const date = x?.date || (now.key.startsWith(A.month) ? now.key : `${A.month}-01`);
  openDlg("expense", x ? "Editar gasto" : "Nuevo gasto", `
    <form id="exp-form" data-id="${x?.id || ""}">
      <div class="two">
        <label><span class="lbl">Monto (Gs.)</span><input class="field" name="amount" inputmode="numeric" data-money value="${fmtNum(x?.amount ?? null)}" placeholder="Ej.: 150.000" required autofocus></label>
        <label><span class="lbl">Fecha</span><input class="field" name="date" type="date" value="${date}" required></label>
      </div>
      <label><span class="lbl">Tipo</span><select class="field" name="category">${[...new Set([...EXP_CATS, ...(x ? [x.category] : [])])].map((c) => `<option${(x?.category || "Materiales") === c ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <label><span class="lbl">Detalle <small>· opcional</small></span><input class="field" name="description" value="${esc(x?.description || "")}" maxlength="80" placeholder="Ej.: esmaltes y limas, alquiler del local"></label>
      <label class="check"><input type="checkbox" name="fixed"${x?.fixed ? " checked" : ""}> Se repite todos los meses (alquiler, internet…)</label>
      <p class="form-error" role="alert" hidden></p>
      <div class="dlg-foot"><button class="btn btn-rose wide" type="submit">Guardar</button></div>
      ${x ? `<button class="link-danger" type="button" data-act="exp-delete" data-id="${x.id}">${ic("trash")}Eliminar gasto</button>` : ""}
    </form>`);
}
async function saveExpense(form) {
  const f = new FormData(form);
  const amount = num(f.get("amount"));
  const date = f.get("date");
  if (!amount) return formError("Poné el monto.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return formError("Elegí la fecha.");
  const prev = D().expenses.find((x) => x.id === form.dataset.id);
  await run(async () => {
    await save("expenses", { ...(prev || { id: uid(), created_at: new Date().toISOString() }), amount, date,
      category: f.get("category"), description: f.get("description").trim() || null, fixed: f.get("fixed") === "on" });
    A.month = date.slice(0, 7);
    closeDlg(); render();
  }, "Gasto guardado ✓");
}

/* ---- Ajustes ---- */
VIEWS.ajustes = () => {
  const s = D().settings;
  const demo = A.db.mode === "demo";
  return `
    <div class="page-head"><h1>Ajustes</h1></div>
    <form id="settings-form">
      ${section("Tu negocio", `<div class="card-ed">
        <label><span class="lbl">Nombre del negocio</span><input class="field" name="business_name" value="${esc(s.business_name)}" maxlength="60"></label>
        <label><span class="lbl">Tu nombre</span><input class="field" name="owner_name" value="${esc(s.owner_name)}" maxlength="40"></label>
        <label><span class="lbl">WhatsApp del salón</span><input class="field" name="whatsapp" type="tel" value="${esc(fmtPhone(s.whatsapp))}"></label>
        <p class="hint">Es el número al que escriben las clientas desde la página.</p>
      </div>`)}
      ${section("Recordatorios", `<div class="card-ed">
        <label><span class="lbl">Avisarme para volver a agendar a los</span>
          <select class="field" name="reminder_days">${[14, 15, 21, 28, 30, 45, 60].map((v) => `<option value="${v}"${+s.reminder_days === v ? " selected" : ""}>${v} días de la última visita</option>`).join("")}</select></label>
        <label><span class="lbl">Mensaje de recordatorio</span><textarea class="field" name="reminder_text" rows="4">${esc(s.reminder_text)}</textarea></label>
        <p class="hint">{nombre}, {dias} y {link} se reemplazan solos por el nombre de la clienta, los días y el enlace de reservas.</p>
        ${"Notification" in window ? `<button class="btn btn-ghost sm" type="button" data-act="notify">${ic("bell")}${Notification.permission === "granted" ? "Avisos activados en este dispositivo" : "Avisarme de reservas nuevas en este dispositivo"}</button>
          <p class="hint">Te avisa mientras el panel esté abierto (también en segundo plano).</p>` : ""}
      </div>`)}
      ${section("Seña", `<div class="card-ed">
        <label class="check"><input type="checkbox" name="deposit_enabled"${s.deposit_enabled ? " checked" : ""}> Pedir seña para confirmar las reservas de la web</label>
        <div class="two">
          <label><span class="lbl">Tipo</span><select class="field" name="deposit_type">
            <option value="fixed"${s.deposit_type !== "percent" ? " selected" : ""}>Monto fijo (Gs.)</option>
            <option value="percent"${s.deposit_type === "percent" ? " selected" : ""}>Porcentaje del total</option></select></label>
          <label><span class="lbl">Monto o %</span><input class="field" name="deposit_value" inputmode="numeric" value="${s.deposit_type === "percent" ? s.deposit_value || "" : fmtNum(s.deposit_value || null)}" placeholder="Ej.: 50.000 o 30"></label>
        </div>
        <label><span class="lbl">Datos para transferir</span><textarea class="field" name="payment_info" rows="4" placeholder="Banco, alias, titular…">${esc(s.payment_info)}</textarea></label>
        <p class="hint">La clienta ve el monto al reservar y estos datos al terminar, con una nota de que también puede pagar con tarjeta o QR pidiéndote los datos por WhatsApp. También van en tu mensaje de confirmación mientras la seña esté pendiente, y en la pregunta «¿Cómo puedo pagar?» de la página.</p>
      </div>`)}
      ${section("Recordatorio del turno", `<div class="card-ed">
        <label><span class="lbl">Mensaje para el día anterior</span><textarea class="field" name="appt_reminder_text" rows="3">${esc(s.appt_reminder_text)}</textarea></label>
        <p class="hint">{nombre}, {dia}, {hora} y {servicios} se completan solos. En Inicio aparece «Recordatorios para mañana».</p>
      </div>`)}
      ${section("Reseñas en Google", `<div class="card-ed">
        <label><span class="lbl">Tu link para dejar reseña</span><input class="field" name="review_url" type="url" value="${esc(s.review_url)}" placeholder="https://g.page/r/…/review"></label>
        <p class="hint">El link sale de tu Perfil de Empresa de Google: en Google Maps buscá tu negocio, tocá «Pedir reseñas» y copiá el enlace.</p>
        <p class="hint">Con el link cargado, la página muestra el botón «Dejar una reseña», y a quien vino en las últimas dos semanas le aparece «¿Cómo te quedó?» arriba de todo. Así no hace falta mandarlo por WhatsApp.</p>
        ${s.review_url ? `<button class="btn btn-ghost sm" type="button" data-act="review-qr">${ic("image")}QR para imprimir en el salón</button>` : ""}
        <label><span class="lbl">Mensaje por WhatsApp <small>· si igual querés pedírsela</small></span><textarea class="field" name="review_text" rows="3">${esc(s.review_text)}</textarea></label>
        <p class="hint">{nombre} y {link} se completan solos.</p>
      </div>`)}
      ${section("Cumpleaños", `<div class="card-ed">
        <label><span class="lbl">Tu regalo de cumpleaños</span><input class="field" name="birthday_gift" value="${esc(s.birthday_gift)}" maxlength="80" placeholder="Ej.: un 10% de descuento"></label>
        <label><span class="lbl">Mensaje</span><textarea class="field" name="birthday_text" rows="3">${esc(s.birthday_text)}</textarea></label>
        <p class="hint">{nombre}, {regalo} y {link} se completan solos. La fecha se carga en la ficha de cada clienta, y en Inicio te aparecen las que cumplen en los próximos 7 días. Su próximo turno queda marcado con 🎂 para que te acuerdes del regalo.</p>
      </div>`)}
      ${section("Políticas del salón", `<div class="card-ed">
        <label><span class="lbl">Se muestran antes de reservar</span><textarea class="field" name="policies_text" rows="4">${esc(s.policies_text)}</textarea></label>
        <p class="hint">Una por renglón. Lo que va antes de los dos puntos sale en negrita. También aparecen en las preguntas frecuentes de la página. Si lo dejás vacío, no se muestra nada.</p>
      </div>`)}
      <p class="form-error" role="alert" hidden></p>
      <div class="sticky-foot"><button class="btn btn-rose wide" type="submit">Guardar ajustes</button></div>
    </form>
    ${section("Cuenta", demo
      ? `<p class="hint"><b>Modo demo.</b> Todo lo que cargues queda guardado solo en este navegador. Para usarlo de verdad (con tus clientas reservando desde sus teléfonos) hay que conectar la base de datos: ver SUPABASE.md.</p>
         <button class="btn btn-ghost sm" type="button" data-act="demo-reset">Borrar los datos de prueba</button>`
      : `<form id="pass-form" class="card-ed">
          <label><span class="lbl">Nueva contraseña</span><input class="field" type="password" name="pass" minlength="8" autocomplete="new-password" required></label>
          <button class="btn btn-ghost sm" type="submit">Cambiar contraseña</button></form>`)}
    ${section("Tus datos", `<button class="btn btn-ghost sm" type="button" data-act="export">Descargar una copia (JSON)</button>
      <button class="btn btn-ghost sm" type="button" data-act="logout">${ic("logout")}Cerrar sesión</button>`)}`;
};

// A QR to her Google review form, to print for the salon: clients scan it with the camera.
const QR_JS = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
async function openReviewQr() {
  const url = D().settings.review_url;
  if (!url) return toast("Primero guardá tu link de reseñas.");
  try { if (!window.qrcode) await loadScript(QR_JS); } catch (e) { return toast(e.message, 4000); }
  await document.fonts?.ready;
  const card = reviewCard(url);
  openDlg("qr", "QR para tus reseñas", `
    <p class="hint">Imprimilo y ponelo en el mostrador o en el espejo: tus clientas lo escanean con la cámara y les abre directo tu página de reseñas en Google.</p>
    <div class="qr-box"></div>
    <div class="dlg-foot"><a class="btn btn-rose wide" href="${card.toDataURL("image/png")}" download="blossom-resenas-qr.png">Descargar imagen</a></div>`);
  $(".qr-box").append(card);
}
// the QR on white with a title and the salon's name
function reviewCard(url) {
  const qr = qrcode(0, "M");
  qr.addData(url); qr.make();
  const n = qr.getModuleCount(), cell = Math.floor(720 / (n + 8)), side = cell * (n + 8), top = 130;
  const c = document.createElement("canvas");
  c.width = side; c.height = side + top + 150;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#23161b";
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect((k + 4) * cell, top + (r + 4) * cell, cell, cell);
  g.textAlign = "center";
  g.font = '600 58px "Cormorant Garamond", serif';
  g.fillText("¿Te gustó cómo quedó?", side / 2, 92);
  g.font = '500 30px Poppins, sans-serif';
  g.fillText("Escaneá y dejanos tu reseña en Google", side / 2, top + side + 34);
  g.fillStyle = "#e0a526"; g.font = '36px sans-serif';
  g.fillText("★★★★★", side / 2, top + side + 88);
  g.fillStyle = "#c42a59"; g.font = '600 26px Poppins, sans-serif';
  g.fillText(D().settings.business_name || "Blossom Beauty Salon", side / 2, top + side + 132);
  return c;
}

/* ---- Más (phones) ---- */
VIEWS.mas = () => {
  const due = dueClients().length;
  return `<div class="page-head"><h1>Más</h1></div>
    <div class="menu">${NAV.slice(3).map((n) => `<a href="#/${n.r}">${ic(n.ic)}<span>${n.label}</span>${n.r === "clientas" && due ? `<span class="count">${due}</span>` : ""}${ic("right")}</a>`).join("")}
      <a href="./" target="_blank" rel="noopener">${ic("ext")}<span>Ver página de reservas</span>${ic("right")}</a>
      <button type="button" data-act="logout">${ic("logout")}<span>Cerrar sesión</span></button>
    </div>`;
};

/* =========================================================
   Events
   ========================================================= */
const ACT = {
  reload: () => run(() => reload(), "Actualizado ✓"),
  logout: async () => { await A.db.auth.signOut(); location.hash = ""; location.reload(); },
  "dlg-close": closeDlg,
  nav: (el, e) => { e.preventDefault(); closeDlg(); location.hash = el.getAttribute("href"); },
  "copy-link": async () => { try { await navigator.clipboard.writeText(bookingUrl()); toast("Enlace copiado ✓"); } catch { toast(bookingUrl(), 5000); } },
  "agenda-today": (el, e) => { e.preventDefault(); A.agenda.mode = "lista"; A.agenda.filter = "hoy"; location.hash = "#/agenda"; render(); },
  "clients-due": (el, e) => { e.preventDefault(); A.clients.filter = "volver"; location.hash = "#/clientas"; render(); },

  // agenda
  "agenda-mode": (el) => { A.agenda.mode = el.dataset.v; render(); },
  "agenda-filter": (el) => { A.agenda.filter = el.dataset.v; render(); },
  "agenda-day": (el) => { A.agenda.day = el.dataset.v; A.agenda.mode = "dia"; render(); },
  "agenda-shift": (el) => { A.agenda.day = addDays(A.agenda.day, +el.dataset.v); render(); },
  "appt-open": (el) => openDetail(el.dataset.id),
  "appt-new": () => openEditor(),
  "block-new": () => openBlock(),
  "appt-edit": (el) => { const a = D().appointments.find((x) => x.id === el.dataset.id); a.kind === "block" ? openBlock(a) : openEditor(a); },
  // confirming or cancelling a booking with several professionals changes all its parts
  "appt-status": (el) => {
    const a = D().appointments.find((x) => x.id === $(".det", $("#dlg")).dataset.id);
    run(async () => {
      for (const x of groupOf(a)) await save("appointments", { ...x, status: el.dataset.s });
      render(); openDetail(a.id);
    }, `Cita: ${STATUS[el.dataset.s].toLowerCase()} ✓`);
  },
  "appt-delete": (el) => {
    if (!confirm("¿Eliminar esta cita? No se puede deshacer. Si la clienta no vino o canceló, mejor marcalo así para que quede en su historial.")) return;
    run(async () => { await remove("appointments", el.dataset.id); closeDlg(); render(); }, "Eliminada");
  },

  // editor
  "e-add": () => { const p = $("#e-picker"); p.hidden = !p.hidden; if (!p.hidden) { $("#e-q").value = ""; paintPicker(); $("#e-q").focus(); } },
  "e-pick": (el) => {
    const s = svcById(el.dataset.id);
    E.lines.push({ service_id: s.id, name: s.name, price: s.price, duration: s.duration || D().settings.default_duration });
    $("#e-picker").hidden = true; paintLines(); paintEditorMeta();
  },
  "e-pick-addon": (el) => {
    const a = D().addons.find((x) => x.id === el.dataset.id);
    E.lines.push({ service_id: null, addon_id: a.id, name: a.name, price: a.price, duration: a.duration || 0 });
    $("#e-picker").hidden = true; paintLines(); paintEditorMeta();
  },
  "e-custom": () => { E.lines.push({ service_id: null, name: "", price: null, duration: 30 }); paintLines(); paintEditorMeta(); $$("#e-lines .l-name").at(-1).focus(); },
  "e-rm": (el) => { E.lines.splice(+el.closest(".line").dataset.i, 1); paintLines(); paintEditorMeta(); },
  "e-time": (el) => { E.start = +el.dataset.v; $('[data-f="start"]').value = hhmm(E.start); paintEditorMeta(); },
  "e-status": (el) => { E.status = el.dataset.v; $$("#e-status button").forEach((b) => b.setAttribute("aria-selected", b === el)); },
  "e-client": (el) => {
    const c = clientById(el.dataset.id);
    E.client_id = c.id; E.name = c.name; E.phone = fmtPhone(c.phone);
    $('[data-f="name"]').value = E.name; $('[data-f="phone"]').value = E.phone;
    $("#e-suggest").innerHTML = "";
  },
  "e-save": () => saveEditor(),

  // services
  "svc-new": () => openService(),
  "svc-edit": (el) => openService(svcById(el.dataset.id)),
  "svc-move": (el) => { const s = svcById(el.dataset.id); move("services", s.id, +el.dataset.v, D().services.filter((x) => x.category_id === s.category_id)).then(render); },
  "svc-photo-rm": () => { A.svcImage = null; $("#svc-photo").innerHTML = "sin foto"; $('[data-act="svc-photo-rm"]').hidden = true; },
  "svc-delete": (el) => {
    if (!confirm("¿Eliminar este servicio? Las citas que ya lo tienen no cambian. Si solo querés esconderlo de la página, apagá «Mostrar en la página de reservas».")) return;
    run(async () => { await remove("services", el.dataset.id); closeDlg(); render(); }, "Servicio eliminado");
  },
  cats: () => openCategories(),
  addons: () => openAddons(),
  "addon-new": () => openAddon(),
  "addon-edit": (el) => openAddon(D().addons.find((x) => x.id === el.dataset.id)),
  "addon-delete": (el) => {
    if (!confirm("¿Eliminar este adicional? Las citas que ya lo tienen no cambian.")) return;
    run(async () => { await remove("addons", el.dataset.id); openAddons(); render(); }, "Adicional eliminado");
  },
  // opening WhatsApp marks the reminder or the review request as sent
  "appt-remind": (el) => {
    const a = D().appointments.find((x) => x.id === el.dataset.id);
    run(async () => {
      for (const x of groupOf(a)) await save("appointments", { ...x, reminded_at: new Date().toISOString() });
      render(); if (A.dlg === "detail") openDetail(a.id);
    });
  },
  "review-ask": (el) => {
    const c = clientById(el.dataset.id);
    if (c) run(async () => { await save("clients", { ...c, review_requested_at: nowInSalon().key }); render(); });
  },
  "dep-paid": () => {
    const a = D().appointments.find((x) => x.id === $(".det", $("#dlg")).dataset.id);
    const amount = num($("#dep-amount").value) || a.deposit_due;
    if (!amount) return toast("Poné el monto de la seña.");
    run(async () => { await save("appointments", { ...a, deposit: amount }); render(); openDetail(a.id); }, "Seña registrada ✓");
  },
  "dep-clear": () => {
    const a = D().appointments.find((x) => x.id === $(".det", $("#dlg")).dataset.id);
    run(async () => { await save("appointments", { ...a, deposit: null }); render(); openDetail(a.id); });
  },
  "gal-move": (el) => move("gallery", el.dataset.id, +el.dataset.v, [...D().gallery].sort(byOrder)).then(render),
  "gal-delete": (el) => {
    if (!confirm("¿Sacar esta foto de la galería?")) return;
    run(async () => { await remove("gallery", el.dataset.id); render(); }, "Foto eliminada");
  },
  "cat-move": (el) => move("categories", el.dataset.id, +el.dataset.v, [...D().categories]).then(() => { openCategories(); render(); }),
  "cat-delete": (el) => {
    if (D().services.some((s) => s.category_id === el.dataset.id)) return toast("Primero pasá sus servicios a otra categoría.", 3500);
    if (!confirm("¿Eliminar esta categoría?")) return;
    run(async () => { await remove("categories", el.dataset.id); openCategories(); render(); });
  },

  // clients
  "clients-filter": (el) => { A.clients.filter = el.dataset.v; render(); },
  "client-new": () => openClient(),
  "client-edit": (el) => openClient(clientById(el.dataset.id), el.dataset.focus),
  "client-book": (el) => { const c = clientById(el.dataset.id); openEditor({ client_id: c.id, client_name: c.name, client_phone: c.phone }); },
  "client-notes": (el) => { const c = clientById(el.dataset.id); run(() => save("clients", { ...c, notes: $("#c-notes").value.trim() || null }), "Nota guardada ✓"); },
  "client-delete": (el) => {
    if (!confirm("¿Eliminar la ficha de esta clienta? Sus citas quedan en la agenda.")) return;
    run(async () => { await remove("clients", el.dataset.id); closeDlg(); location.hash = "#/clientas"; }, "Clienta eliminada");
  },
  // opening WhatsApp (or "ya le escribí") marks the reminder as sent
  remind: (el) => {
    const c = clientById(el.dataset.id);
    run(async () => { await save("clients", { ...c, reminded_at: nowInSalon().key }); render(); });
  },
  "bday-sent": (el) => {
    const c = clientById(el.dataset.id);
    run(async () => { await save("clients", { ...c, birthday_greeted_at: nowInSalon().key }); render(); });
  },

  // special days, team
  "special-new": () => openSpecial(),
  "special-delete": (el) => run(async () => { await remove("exceptions", el.dataset.id); render(); }, "Quitado"),
  "staff-new": () => openStaff(),
  "staff-take": (el) => {
    const st = staffById(el.dataset.id);
    const ids = uncovered().map((x) => x.id);
    run(async () => { await save("staff", { ...st, service_ids: [...new Set([...(st.service_ids || []), ...ids])] }); render(); },
      `Listo: ${ids.length} servicio${ids.length === 1 ? "" : "s"} para ${firstName(st.name)} ✓`);
  },
  "staff-edit": (el) => openStaff(staffById(el.dataset.id)),
  "staff-delete": (el) => {
    const s = staffById(el.dataset.id);
    if (!D().staff.some((x) => x.active && x.id !== s.id)) return toast("Tiene que quedar al menos una profesional.", 3500);
    const n = D().appointments.filter((a) => a.staff_id === s.id && live(a) && !isPast(a)).length;
    if (!confirm(`¿Eliminar a ${s.name}?${n ? ` Tiene ${n} cita${n === 1 ? "" : "s"} próximas que van a quedar sin profesional.` : ""} Si solo deja de atender por un tiempo, mejor desactivala.`)) return;
    run(async () => { await remove("staff", s.id); closeDlg(); render(); }, "Eliminada");
  },

  // money, settings
  "exp-new": () => openExpense(),
  "exp-edit": (el) => openExpense(D().expenses.find((x) => x.id === el.dataset.id)),
  "exp-delete": (el) => {
    if (!confirm("¿Eliminar este gasto?")) return;
    run(async () => { await remove("expenses", el.dataset.id); closeDlg(); render(); }, "Gasto eliminado");
  },
  // copies last month's fixed expenses into this month, same day and amount (she can edit them after)
  "exp-repeat": () => {
    const [y, m] = A.month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const list = fixedToRepeat();
    run(async () => {
      for (const x of list) {
        await save("expenses", { ...x, id: uid(), date: `${A.month}-${pad(Math.min(+x.date.slice(8), last))}`, created_at: new Date().toISOString() });
      }
      render();
    }, `${list.length === 1 ? "Gasto cargado" : `${list.length} gastos cargados`} ✓`);
  },
  "review-qr": () => openReviewQr(),
  month: (el) => { const [y, m] = A.month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + +el.dataset.v, 1)); A.month = keyOf(d).slice(0, 7); render(); },
  notify: async () => { try { await Notification.requestPermission(); } catch {} render(); },
  export: () => {
    const blob = new Blob([JSON.stringify(D(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `blossom-datos-${nowInSalon().key}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  "demo-reset": () => { if (confirm("¿Borrar todos los datos de prueba y volver a empezar?")) { A.db.reset(); location.reload(); } },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (el && ACT[el.dataset.act] && !el.disabled) ACT[el.dataset.act](el, e);
  // tap on a free spot of the day view: new appointment at that time
  const col = !el && e.target.closest(".tl-col");
  if (col) {
    const m = +col.dataset.from + Math.floor((e.clientY - col.getBoundingClientRect().top) / PX / 15) * 15;
    openEditor({ date: A.agenda.day, start_min: m, staff_id: col.dataset.staff || undefined });
  }
});

const CHANGE = {
  "agenda-staff": (el) => { A.agenda.staff = el.value; render(); },
  "agenda-date": (el) => { if (el.value) { A.agenda.day = el.value; render(); } },
  "svc-active": (el) => { const s = svcById(el.dataset.id); run(async () => { await save("services", { ...s, active: el.checked }); render(); }, el.checked ? "Visible en la página ✓" : "Oculto de la página"); },
  "gal-caption": (el) => {
    const g = D().gallery.find((x) => x.id === el.dataset.id);
    run(() => save("gallery", { ...g, caption: el.value.trim() || null }), "Guardado ✓");
  },
  "gal-active": (el) => {
    const g = D().gallery.find((x) => x.id === el.dataset.id);
    run(async () => { await save("gallery", { ...g, active: el.checked }); render(); }, el.checked ? "Visible en la página ✓" : "Oculta de la página");
  },
  "cat-name": (el) => {
    const c = D().categories.find((x) => x.id === el.dataset.id);
    const name = el.value.trim();
    if (!name || name === c.name) { el.value = c.name; return; }
    run(async () => { await save("categories", { ...c, name }); render(); }, "Categoría guardada ✓");
  },
};
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.change && CHANGE[t.dataset.change]) return CHANGE[t.dataset.change](t);
  // hours editors and special-day form: show/hide the related fields
  if (t.dataset.h === "on") { const d = t.closest(".day-ed"); d.classList.toggle("off", !t.checked); $(".day-top .muted", d).textContent = t.checked ? "" : "Cerrado"; }
  if (t.dataset.h === "pause" || t.name === "pause") $(".pause", t.closest(".day-body, .sp-hours")).hidden = !t.checked;
  if (t.name === "type") $(".sp-hours").hidden = t.value !== "hours";
  if (t.dataset.toggle) $(t.dataset.toggle).hidden = t.checked === (t.name === "all");
  if (t.id === "gal-file" && t.files.length) { uploadGallery(t.files); return; }
  if (t.id === "svc-file" && t.files[0]) {
    $("#svc-photo").innerHTML = '<span class="muted small">Subiendo…</span>';
    run(async () => { A.svcImage = await A.db.uploadImage(t.files[0]); }).then(() => {
      if (A.dlg !== "service") return;
      $("#svc-photo").innerHTML = A.svcImage ? `<img src="${esc(A.svcImage)}" alt="">` : "sin foto";
      $('[data-act="svc-photo-rm"]').hidden = !A.svcImage;
    });
  }
});

// live inputs: the appointment editor, the client search
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "c-search") { A.clients.q = t.value; paintClients(); return; }
  if (t.id === "e-q") { paintPicker(); return; }
  if (!E || !t.closest("#dlg")) return;
  const f = t.dataset.f, l = t.dataset.l;
  if (f === "start") E.start = t.value ? toMin(t.value) : null;
  else if (f) E[f] = t.value;
  if (f === "name") { if (E.client_id && clientById(E.client_id)?.name !== E.name) E.client_id = null; paintSuggest(); }
  if (l) E.lines[+t.closest(".line").dataset.i][l] = l === "name" ? t.value : num(t.value);
  if (["start", "date", "staff_id"].includes(f) || l) paintEditorMeta();
});
// prices read nicer with dots: 70.000
document.addEventListener("focusout", (e) => {
  const t = e.target;
  if (t.dataset.l === "price" || t.dataset.money !== undefined) t.value = fmtNum(num(t.value));
});

document.addEventListener("submit", (e) => {
  const form = e.target;
  e.preventDefault();
  if (form.id === "login-form") return login();
  if (form.id === "block-form") return saveBlock(form);
  if (form.id === "svc-form") return saveService(form);
  if (form.id === "client-form") return saveClient(form);
  if (form.id === "special-form") return saveSpecial(form);
  if (form.id === "staff-form") return saveStaff(form);
  if (form.id === "addon-form") return saveAddon(form);
  if (form.id === "exp-form") return saveExpense(form);
  if (form.id === "cat-form") {
    const name = new FormData(form).get("name").trim();
    if (!name) return;
    return run(async () => { await save("categories", { id: uid(), name, image: null, sort: Math.max(-1, ...D().categories.map((c) => c.sort ?? 0)) + 1 }); openCategories(); render(); }, "Categoría agregada ✓");
  }
  if (form.id === "hours-form") {
    const r = readHours($("#h-salon"));
    if (r.error) return formError(r.error);
    const f = new FormData(form);
    return run(async () => {
      await saveSettings({
        hours: r.hours, booking_days: +f.get("booking_days"), slot_step: +f.get("slot_step"), min_notice: +f.get("min_notice"),
        default_duration: +f.get("default_duration"), auto_confirm: f.get("auto_confirm") === "on",
      });
      render();
    }, "Horarios guardados ✓");
  }
  if (form.id === "settings-form") {
    const f = new FormData(form);
    const phone = normPhone(f.get("whatsapp"));
    if (phone.length < 8) return formError("Revisá el WhatsApp del salón.");
    const depType = f.get("deposit_type") === "percent" ? "percent" : "fixed";
    const depValue = num(f.get("deposit_value")) || 0;
    const depOn = f.get("deposit_enabled") === "on";
    if (depOn && !depValue) return formError("Poné el monto de la seña.");
    if (depType === "percent" && depValue > 100) return formError("El porcentaje de la seña tiene que ser hasta 100.");
    const reviewUrl = f.get("review_url").trim();
    if (reviewUrl && !/^https?:\/\//.test(reviewUrl)) return formError("El link de reseñas tiene que empezar con https://");
    const gift = f.get("birthday_gift").trim();
    const giftText = f.get("birthday_text").trim() || SEED.settings.birthday_text;
    if (!gift && giftText.includes("{regalo}")) return formError("Poné tu regalo de cumpleaños, o sacá {regalo} del mensaje.");
    return run(async () => {
      await saveSettings({
        business_name: f.get("business_name").trim() || SEED.settings.business_name, owner_name: f.get("owner_name").trim(),
        whatsapp: phone, reminder_days: +f.get("reminder_days"), reminder_text: f.get("reminder_text").trim() || SEED.settings.reminder_text,
        deposit_enabled: depOn, deposit_type: depType, deposit_value: depValue, payment_info: f.get("payment_info").trim(),
        appt_reminder_text: f.get("appt_reminder_text").trim() || SEED.settings.appt_reminder_text,
        review_url: reviewUrl, review_text: f.get("review_text").trim() || SEED.settings.review_text,
        birthday_gift: gift, birthday_text: giftText,
        policies_text: f.get("policies_text").split("\n").map((l) => l.trim()).filter(Boolean).join("\n"),
      });
      render();
    }, "Ajustes guardados ✓");
  }
  if (form.id === "pass-form") {
    const p = new FormData(form).get("pass");
    return run(async () => { await A.db.auth.changePassword(p); form.reset(); }, "Contraseña cambiada ✓");
  }
});

$("#dlg-backdrop").addEventListener("click", closeDlg);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && A.dlg) closeDlg(); });
addEventListener("hashchange", () => { closeDlg(); render(); scrollTo(0, 0); $("#view").focus({ preventScroll: true }); });

/* =========================================================
   Sign in and boot
   ========================================================= */
function showLogin(msg) {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#l-demo").hidden = A.db?.mode !== "demo";
  const err = $("#l-error");
  err.textContent = msg || ""; err.hidden = !msg;
  setTimeout(() => $("#l-email").focus(), 50);
}

async function login() {
  const btn = $("#login-form button[type=submit]");
  btn.disabled = true;
  try {
    await A.db.auth.signIn($("#l-email").value.trim(), $("#l-pass").value);
    await enter();
  } catch (e) {
    showLogin(e.message || "No se pudo entrar.");
  } finally { btn.disabled = false; }
}

let timer;
async function enter() {
  if (!(await A.db.auth.isAdmin())) {
    await A.db.auth.signOut();
    return showLogin("Este usuario no tiene acceso al panel.");
  }
  await reload({ quiet: true });
  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#demo-badge").hidden = A.db.mode !== "demo";
  render();
  // pick up new web bookings
  clearInterval(timer);
  const tick = () => {
    const typing = document.activeElement?.matches("#view input, #view textarea, #view select");
    if (!A.dlg && !typing && document.visibilityState === "visible") reload().catch(() => {});
    else reload({ quiet: true }).catch(() => {});
  };
  timer = setInterval(tick, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });
}

(async function boot() {
  initTheme();
  try {
    A.db = await DB;
  } catch (e) {
    showLogin(e.message);
    return;
  }
  try {
    if (await A.db.auth.session()) await enter();
    else showLogin();
  } catch (e) {
    showLogin(e.message || "No se pudo conectar.");
  }
})();
