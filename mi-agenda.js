/* Blossom Beauty Salon — "Mi agenda" (mi-agenda.html): each professional sees her own turns, her free time
   and what she's earning. She opens it with the personal link Mica sends from Profesionales
   (mi-agenda.html#CODE); the code stays saved on her phone. Read only: Mica changes turns from her panel. */

const M = { db: null, code: null, data: null, day: null, month: null };
const CODE_KEY = "blossom-staff-code";

const live = (a) => !OFF.includes(a.status);
const isPast = (a, now = nowInSalon()) => a.date < now.key || (a.date === now.key && a.end_min <= now.minute);
const sum = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);
const firstName = (n) => (n || "").trim().split(" ")[0];
const itemsText = (a) => (a.items || []).map((i) => i.name).join(" · ");
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const STATUS = { confirmed: "Confirmada", pending: "Por confirmar", cancelled: "Cancelada", no_show: "No vino" };
const OWNER = "Mica";
const shiftMonth = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return keyOf(d).slice(0, 7); };
const monthName = (ym) => { const m = MONTHS[+ym.slice(5) - 1]; return `${m[0].toUpperCase() + m.slice(1)} ${ym.slice(0, 4)}`; };
function relDay(k) {
  const t = nowInSalon().key;
  if (k === t) return "Hoy";
  if (k === addDays(t, 1)) return "Mañana";
  if (k === addDays(t, -1)) return "Ayer";
  return `${DAYS_SHORT[dowOf(k)]} ${shortDate(k)}`;
}

const ic = {
  lock: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  left: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  right: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  wa: '<svg class="ic" aria-hidden="true"><use href="#i-wa"/></svg>',
};

/* ---------- money: her commission on each turn (or the turn's total when Mica didn't set one) ---------- */
const pct = () => M.data.staff.commission;
const earn = (a) => (pct() == null ? a.total || 0 : Math.round(((a.total || 0) * pct()) / 100));
const turns = (ym) => M.data.appointments.filter((a) => a.kind !== "block" && a.date.startsWith(ym));
// a turn counts as earned once it's over and confirmed, the same rule as Mica's Control financiero
const earned = (list, now) => list.filter((a) => a.status === "confirmed" && isPast(a, now));

/* ---------- free time: her hours that day minus her turns ---------- */
function freeGaps(k, now) {
  const busy = M.data.appointments.filter((a) => a.date === k && live(a)).map((a) => [a.start_min, a.end_min]).sort((a, b) => a[0] - b[0]);
  const from = k === now.key ? Math.ceil(now.minute / 15) * 15 : 0;
  const out = [];
  for (const [o, c] of blocksFor(M.data, M.data.staff, k).slice().sort((a, b) => a[0] - b[0])) {
    let t = Math.max(o, from);
    for (const [a, b] of busy) {
      if (b <= t || a >= c) continue;
      if (a > t) out.push([t, a]);
      t = Math.max(t, b);
    }
    if (t < c) out.push([t, c]);
  }
  return out.filter(([a, b]) => b - a >= 15);
}

/* ---------- views ---------- */
function render() {
  const now = nowInSalon();
  const st = M.data.staff;
  M.day ||= now.key;
  M.month ||= now.key.slice(0, 7);
  $("#view").innerHTML = `
    <div class="hello">
      <h1>Hola, <em>${esc(firstName(st.name))}</em></h1>
      <p class="muted">${longDate(now.key)}</p>
    </div>
    ${earnings(now)}
    ${dayView(now)}
    ${upcoming(now)}
    <p class="hint center solo-foot">¿Algo no coincide? Solo ${OWNER} puede cambiar los turnos.<br>
      <a href="${waLink(`¡Hola ${OWNER}! Te escribo por mi agenda: `)}" target="_blank" rel="noopener">${ic.wa}Escribile por WhatsApp</a></p>
    <p class="hint center"><button class="link-plain" type="button" data-act="logout">Salir de mi agenda</button></p>`;
  document.title = `Mi agenda · ${firstName(st.name)}`;
  $(".strip [aria-pressed='true']")?.scrollIntoView({ inline: "center", block: "nearest" });
}

function earnings(now) {
  const ym = M.month, thisMonth = now.key.slice(0, 7);
  const list = turns(ym);
  const done = earned(list, now);
  const ahead = list.filter((a) => live(a) && !isPast(a, now));
  const got = sum(done, earn), will = sum(ahead, earn);
  const c = pct();
  // the page gets two months back and three ahead
  const minM = shiftMonth(thisMonth, -2), maxM = addDays(now.key, 92).slice(0, 7);
  let goal = "";
  if (ym === thisMonth) {
    const last = sum(earned(turns(shiftMonth(ym, -1)), now), earn);
    if (last > 0) {
      const w = Math.min(100, (got / last) * 100);
      goal = `<div class="goal">
        <p>${got >= last ? `🎉 <b>¡Ya superaste el mes pasado!</b> Fueron ${gs(last)}.`
          : `El mes pasado: <b>${gs(last)}</b>. Te faltan <b>${gs(last - got)}</b> para superarlo${got + will >= last ? ", y con lo agendado ya llegás 💪" : "."}`}</p>
        <div class="goal-bar" role="img" aria-label="${Math.round(w)}% de lo del mes pasado"><i style="--w:${w}%"></i></div>
      </div>`;
    }
  }
  return `
    <div class="monthbar">
      <button class="icon-btn sm" type="button" data-act="month" data-v="-1" aria-label="Mes anterior"${ym <= minM ? " disabled" : ""}>${ic.left}</button>
      <b>${monthName(ym)}</b>
      <button class="icon-btn sm" type="button" data-act="month" data-v="1" aria-label="Mes siguiente"${ym >= maxM ? " disabled" : ""}>${ic.right}</button>
    </div>
    <div class="stats money">
      <div class="stat big profit"><small>${c == null ? "Realizado" : "Ya ganaste"}</small><b>${gs(got)}</b><small>${plural(done.length, "turno realizado", "turnos realizados")}</small></div>
      <div class="stat big"><small>${c == null ? "Agendado" : "Por ganar"}</small><b>${gs(will)}</b><small>${plural(ahead.length, "turno agendado", "turnos agendados")}</small></div>
    </div>
    ${goal}
    <p class="hint">${c == null ? "Lo que suman tus turnos, con el precio de cada uno."
      : `Tu comisión es del <b>${c}%</b> de cada turno. Se suma cuando el turno ya pasó y está confirmado.`}</p>`;
}

function dayView(now) {
  const k = M.day;
  const strip = Array.from({ length: 16 }, (_, i) => addDays(now.key, i - 2)).map((d) => {
    const n = M.data.appointments.filter((a) => a.date === d && live(a) && a.kind !== "block").length;
    return `<button type="button" class="pill pill-day${d === now.key ? " is-today" : ""}" data-act="day" data-v="${d}" aria-pressed="${d === k}">${DAYS_SHORT[dowOf(d)]}<small>${+d.slice(8)}</small>${n ? `<i class="dot" aria-label="${plural(n, "turno")}"></i>` : ""}</button>`;
  }).join("");
  const appts = M.data.appointments.filter((a) => a.date === k);
  const gaps = k >= now.key ? freeGaps(k, now) : [];
  const ex = exceptionFor(M.data, M.data.staff.id, k);
  const open = blocksFor(M.data, M.data.staff, k).length > 0;
  const rows = [...appts.map((a) => ({ t: a.start_min, html: card(a) })), ...gaps.map(([a, b]) => ({ t: a, html: gapRow(a, b) }))]
    .sort((x, y) => x.t - y.t).map((r) => r.html).join("");
  const mine = appts.filter((a) => a.kind !== "block" && live(a));
  const free = sum(gaps, ([a, b]) => b - a);
  const summary = [mine.length && plural(mine.length, "turno"), free && `${dur(free)} libre`].filter(Boolean).join(" · ");
  return `<section class="sec">
    <div class="sec-head"><h2>Tus turnos</h2></div>
    <div class="pills scroll strip">${strip}</div>
    <h3 class="day-h"><span>${relDay(k) === `${DAYS_SHORT[dowOf(k)]} ${shortDate(k)}` ? longDate(k) : `${relDay(k)} · ${longDate(k)}`}</span><small>${summary}</small></h3>
    ${ex?.note ? `<p class="hint">${esc(ex.note)}</p>` : ""}
    ${rows ? `<div class="list">${rows}</div>` : `<div class="empty"><svg class="sparkle"><use href="#i-sparkle"/></svg><p>${open ? "No tenés turnos este día." : "No trabajás este día."}</p></div>`}
  </section>`;
}

function card(a, { date = false } = {}) {
  const when = `<span class="a-time">${date ? `<small class="a-date">${relDay(a.date)}</small>` : ""}<b>${hhmm(a.start_min)}</b><small>${hhmm(a.end_min)}</small></span>`;
  const tag = date ? `button type="button" data-act="day" data-v="${a.date}"` : "div";
  const close = date ? "button" : "div";
  if (a.kind === "block") {
    return `<${tag} class="appt is-block">${when}<span class="a-main"><b>${ic.lock}${esc(a.notes || "Horario bloqueado")}</b><small>Bloqueado por ${OWNER}</small></span></${close}>`;
  }
  const badge = a.status !== "confirmed" ? `<span class="badge b-${a.status}">${STATUS[a.status]}</span>` : "";
  return `<${tag} class="appt s-${a.status}">${when}
    <span class="a-main"><b>${esc(a.client_name || "Clienta")}</b><small>${esc(itemsText(a)) || "Sin servicios"}</small>
      ${a.notes ? `<small class="a-note">${esc(a.notes)}</small>` : ""}</span>
    <span class="a-side"><b>${gs(a.total)}</b>${pct() != null && live(a) ? `<small class="earn">+${gs(earn(a))}</small>` : ""}${badge}</span>
  </${close}>`;
}

const gapRow = (a, b) => `<div class="gap"><span class="a-time"><b>${hhmm(a)}</b><small>${hhmm(b)}</small></span><span>Libre · ${dur(b - a)}</span></div>`;

function upcoming(now) {
  const next = M.data.appointments.filter((a) => a.kind !== "block" && live(a) && a.date > now.key)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min).slice(0, 10);
  return `<section class="sec">
    <div class="sec-head"><h2>Próximos días</h2></div>
    ${next.length ? `<div class="list">${next.map((a) => card(a, { date: true })).join("")}</div>`
      : `<div class="empty"><svg class="sparkle"><use href="#i-sparkle"/></svg><p>Todavía no tenés turnos para los próximos días.</p></div>`}
  </section>
  <section class="share">
    <p><b>¿Querés llenar tus horarios libres?</b><small>Pasales el link de reservas a tus clientas: eligen el servicio y el horario solas.</small></p>
    <code>${esc(location.origin + location.pathname.replace(/[^/]*$/, ""))}</code>
    <div class="row"><button class="btn btn-ghost" type="button" data-act="copy-link">Copiar enlace</button></div>
  </section>`;
}

/* ---------- small helpers ---------- */
let toastTimer;
function toast(msg, ms = 2200) {
  const el = $("#toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

async function load() {
  M.data = await M.db.staffAgenda(M.code);
  M.data.settings = { ...SEED.settings, ...M.data.settings };
  M.data.staff.commission ??= null;
  SETTINGS = M.data.settings;
}

/* ---------- sign in and boot ---------- */
function showLogin(msg) {
  $("#app").hidden = true;
  $("#login").hidden = false;
  const err = $("#l-error");
  err.textContent = msg || ""; err.hidden = !msg;
  setTimeout(() => $("#l-code").focus(), 50);
}

async function enter(code) {
  M.code = cleanStaffCode(code);
  try {
    await load();
  } catch (e) {
    // a wrong or withdrawn code is forgotten; a connection problem keeps it for next time
    if (/código/.test(e.message)) { saved.del(CODE_KEY); M.code = null; }
    return showLogin(e.message || "No se pudo conectar.");
  }
  saved.set(CODE_KEY, M.code);
  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#demo-badge").hidden = M.db.mode !== "demo";
  render();
}

// refresh while it's open, so changes Mica makes show up
let timer;
function keepFresh() {
  clearInterval(timer);
  const tick = () => {
    if (!M.data || document.visibilityState !== "visible") return;
    load().then(render).catch((e) => { if (/código/.test(e.message)) { saved.del(CODE_KEY); location.reload(); } });
  };
  timer = setInterval(tick, 120000);
  document.addEventListener("visibilitychange", tick);
}

const ACT = {
  day: (el) => { M.day = el.dataset.v; render(); if (el.closest(".list")) $(".strip").scrollIntoView({ block: "center", behavior: motion() }); },
  month: (el) => { M.month = shiftMonth(M.month, +el.dataset.v); render(); },
  logout: () => {
    if (!confirm("¿Salir? Para volver a entrar vas a necesitar tu link o tu código.")) return;
    saved.del(CODE_KEY); M.code = M.data = null; showLogin();
  },
  reload: async () => { try { await load(); render(); toast("Actualizado ✓"); } catch (e) { toast(e.message || "No se pudo actualizar.", 4000); } },
  "copy-link": async () => {
    const url = location.origin + location.pathname.replace(/[^/]*$/, "");
    try { await navigator.clipboard.writeText(url); toast("Enlace copiado ✓"); } catch { toast(url, 5000); }
  },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (el && ACT[el.dataset.act]) ACT[el.dataset.act](el, e);
});

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#login-form button[type=submit]");
  btn.disabled = true;
  await enter($("#l-code").value);
  btn.disabled = false;
});

(async function boot() {
  initTheme();
  // the link Mica sends carries the code after "#": keep it on this phone and take it off the address
  const fromLink = cleanStaffCode(location.hash.slice(1));
  if (fromLink) history.replaceState(null, "", location.pathname + location.search);
  try {
    M.db = await DB;
  } catch (e) {
    return showLogin(e.message);
  }
  const code = fromLink || saved.get(CODE_KEY);
  if (code) await enter(code);
  else showLogin();
  keepFresh();
})();
