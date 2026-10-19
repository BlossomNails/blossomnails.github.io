/* Blossom Beauty Salon — public page: the reservas view and the salón view.
   Services, prices, hours and free times come from core.js (Supabase or modo demo).
   Mica changes them from her panel (admin.html), not here. */

let DATA = null; // settings, categories, services, staff, exceptions, busy
let SERVICES = [];
let CATEGORIES = [];
const PUBLIC_CACHE = "blossom-public-cache";

/* ---------- currency ---------- */
// Prices are charged in guaraníes; other currencies are shown as an approximation.
const CURRENCIES = [
  { code: "PYG", label: "Gs." },
  { code: "USD", label: "US$" },
  { code: "BRL", label: "R$" },
  { code: "EUR", label: "€" },
];
// fallback rates (1 Gs. in each currency), 15/10/2026; live rates are cached for 12 hours
let RATES = { PYG: 1, USD: 0.000175, BRL: 0.00088, EUR: 0.000156 };
let currency = CURRENCIES.some((c) => c.code === saved.get("blossom-currency")) ? saved.get("blossom-currency") : "PYG";

const convert = (pyg, code = currency) => {
  const c = CURRENCIES.find((x) => x.code === code);
  const v = (pyg * RATES[code]).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${c.label} ${v}`;
};
const money = (pyg) => (currency === "PYG" ? gs(pyg) : "≈ " + convert(pyg));

function paintPrices() {
  $$("[data-pyg]").forEach((el) => { el.textContent = (el.dataset.prefix || "") + money(+el.dataset.pyg); });
  $$(".cur-note").forEach((el) => { el.hidden = currency === "PYG"; });
  $$(".cur-switch").forEach((sw) => {
    const i = CURRENCIES.findIndex((c) => c.code === currency);
    sw.style.setProperty("--i", i);
    $$("button", sw).forEach((b, k) => { b.setAttribute("aria-checked", k === i); b.tabIndex = k === i ? 0 : -1; });
  });
  document.dispatchEvent(new Event("currencychange"));
}

function initCurrency() {
  $$("[data-currency-switch]").forEach((box) => {
    box.innerHTML = `<div class="cur-switch" role="radiogroup" aria-label="Ver precios en">
        <span class="cur-thumb" aria-hidden="true"></span>
        ${CURRENCIES.map((c) => `<button type="button" role="radio" data-cur="${c.code}" aria-label="${c.code}">${c.label}</button>`).join("")}
      </div>
      <p class="cur-note" hidden>Precios aproximados. Se cobra en guaraníes.</p>`;
    box.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const buttons = $$("[data-cur]", box);
      const i = buttons.findIndex((b) => b.dataset.cur === currency);
      const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1
        : (i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].click(); buttons[next].focus();
    });
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-cur]");
      if (!b) return;
      currency = b.dataset.cur;
      saved.set("blossom-currency", currency);
      paintPrices();
    });
  });
  paintPrices();

  const cached = saved.get("blossom-rates");
  if (cached && Date.now() - cached.t < 12 * 3600e3) { RATES = { ...RATES, ...cached.rates }; paintPrices(); return; }
  fetch("https://open.er-api.com/v6/latest/PYG")
    .then((r) => r.json())
    .then((d) => {
      if (d.result !== "success") return;
      const rates = { USD: d.rates.USD, BRL: d.rates.BRL, EUR: d.rates.EUR };
      if (!Object.values(rates).every((v) => v > 0)) return;
      RATES = { ...RATES, ...rates };
      saved.set("blossom-rates", { t: Date.now(), rates });
      paintPrices();
    })
    .catch(() => {});
}

const ICONS = {
  plus: '<svg class="i-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg class="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

/* ---------- open now, hours ---------- */
function openStatus() {
  const { key, minute } = nowInSalon();
  const today = salonBlocks(DATA, key);
  for (const [o, c] of today) {
    if (minute >= o && minute < c) return { state: "open", text: `Abierto ahora · hasta las ${hhmm(c)}` };
  }
  const next = today.find(([o]) => o > minute);
  if (next && today.some(([, c]) => c <= minute)) return { state: "break", text: `En pausa · volvemos a las ${hhmm(next[0])}` };
  if (next) return { state: "closed", text: `Cerrado · abrimos hoy a las ${hhmm(next[0])}` };
  for (let i = 1; i <= 14; i++) {
    const k = addDays(key, i);
    const b = salonBlocks(DATA, k);
    if (b.length) {
      const label = i === 1 ? "mañana" : i < 7 ? DAYS[dowOf(k)].toLowerCase() : `el ${DAYS[dowOf(k)].toLowerCase()} ${shortDate(k)}`;
      return { state: "closed", text: `Cerrado · abrimos ${label} a las ${hhmm(b[0][0])}` };
    }
  }
  return { state: "closed", text: "Cerrado" };
}

function renderStatus() {
  if (!DATA) return;
  const s = openStatus();
  $$("[data-status]").forEach((el) => { el.dataset.state = s.state; el.textContent = s.text; });
}

function renderHours() {
  const today = nowInSalon().day;
  const hours = SETTINGS.hours;
  $$("[data-hours]").forEach((ul) => {
    ul.innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => {
      const txt = hours[d].length ? hours[d].map(([o, c]) => `${hhmm(o)}–${hhmm(c)}`).join(" · ") : "Cerrado";
      return `<li class="${d === today ? "today" : ""}"><span>${DAYS[d]}</span><span>${txt}</span></li>`;
    }).join("");
  });
  // "Lun a sáb · 08–12 y 14–19 h" when every open day has the same hours
  const open = [1, 2, 3, 4, 5, 6, 0].filter((d) => hours[d].length);
  if (open.length && open.every((d) => JSON.stringify(hours[d]) === JSON.stringify(hours[open[0]]))) {
    const t = (m) => (m % 60 ? hhmm(m) : pad(m / 60));
    const run = open.length > 2 && open.every((d, i) => !i || (d || 7) === (open[i - 1] || 7) + 1);
    const days = run ? `${DAYS_SHORT[open[0]]} a ${DAYS_SHORT[open.at(-1)].toLowerCase()}` : open.map((d) => DAYS_SHORT[d]).join(", ");
    $$("[data-hours-summary]").forEach((el) => { el.textContent = `${days} · ${hours[open[0]].map(([o, c]) => `${t(o)}–${t(c)}`).join(" y ")} h`; });
  }
}

function wireWhatsAppLinks() {
  $$("[data-wa]").forEach((a) => {
    a.href = waLink(a.dataset.wa || "¡Hola Mica! Vengo desde la web de Blossom 🌸");
    a.target = "_blank"; a.rel = "noopener";
  });
}

/* =========================================================
   RESERVAS view
   ========================================================= */
const cartStore = {
  get() { try { return JSON.parse(sessionStorage.getItem("blossom-cart") || "[]"); } catch { return []; } },
  set(v) { try { sessionStorage.setItem("blossom-cart", JSON.stringify(v)); } catch {} },
};
// the visitor's name, phone and bookings, remembered on her phone so she doesn't type them again
const me = {
  get: () => saved.get("blossom-me") || { bookings: [] },
  set: (v) => saved.set("blossom-me", v),
};

let renderCatalog = () => {};
let renderMe = () => {};

function initReservas() {
  const list = $("#services");
  if (!list) return;

  let cart = cartStore.get();
  const booking = { staff: null, day: null, slot: null };
  const svc = (id) => SERVICES.find((s) => s.id === id);

  renderCatalog = () => {
    cart = cart.filter((id) => svc(id));
    const cats = CATEGORIES.filter((c) => SERVICES.some((s) => s.category_id === c.id));
    const other = SERVICES.filter((s) => !cats.some((c) => c.id === s.category_id));
    if (other.length) cats.push({ id: "otros", name: "Otros" });
    $("#chips").innerHTML = cats.map((c) => `<a class="chip" href="#cat-${esc(c.id)}">${esc(c.name)}</a>`).join("");
    list.innerHTML = cats.map((c) => {
      const items = (c.id === "otros" ? other : SERVICES.filter((s) => s.category_id === c.id)).map((s) => `
        <li class="svc" data-id="${esc(s.id)}">
          ${s.image
            ? `<img class="thumb" src="${esc(s.image)}" alt="" loading="lazy" width="76" height="76">`
            : `<div class="thumb-ph" aria-hidden="true"><svg class="sparkle"><use href="#i-sparkle"/></svg></div>`}
          <div>
            <p class="name">${esc(s.name)}</p>
            ${s.description ? `<p class="desc">${esc(s.description)}</p>` : ""}
            <div class="meta">
              <span class="price"${s.price ? ` data-pyg="${s.price}"` : ""}>${s.price ? money(s.price) : "Consultar"}</span>
              ${s.duration ? `<span class="dur">· ${dur(s.duration)}</span>` : ""}
            </div>
          </div>
          <button class="add" type="button" aria-pressed="false" aria-label="Agregar ${esc(s.name)}">${ICONS.plus}${ICONS.check}</button>
        </li>`).join("");
      return `<section class="cat" id="cat-${esc(c.id)}" aria-labelledby="h-${esc(c.id)}"><h3 id="h-${esc(c.id)}">${esc(c.name)}</h3><ul class="svc-list">${items}</ul></section>`;
    }).join("");

    // highlight the chip of the category in view
    const chips = $$("#chips .chip");
    io.disconnect();
    io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        chips.forEach((c) => c.setAttribute("aria-current", c.getAttribute("href") === "#" + en.target.id));
        const active = chips.find((c) => c.getAttribute("href") === "#" + en.target.id);
        if (active) {
          const row = $("#chips");
          row.scrollTo({ left: active.offsetLeft - row.clientWidth / 2 + active.offsetWidth / 2, behavior: motion() });
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$(".cat").forEach((s) => io.observe(s));
    sync();
  };
  let io = new IntersectionObserver(() => {});

  list.addEventListener("click", (e) => {
    const btn = e.target.closest(".add");
    if (!btn) return;
    const id = btn.closest(".svc").dataset.id;
    if (cart.includes(id)) { cart = cart.filter((x) => x !== id); }
    else { cart.push(id); toast(`${svc(id).name} agregado ✓`); }
    sync();
  });

  // ---- cart bar + sheet ----
  const bar = $("#cartbar"), idle = $("#idlebar");
  const sheet = $("#sheet"), root = document.documentElement;
  const focus = modalFocus(sheet);

  function totals() {
    const items = cart.map(svc);
    const def = SETTINGS.default_duration;
    return {
      items,
      price: items.reduce((a, s) => a + (s.price || 0), 0),
      need: items.reduce((a, s) => a + (s.duration || def), 0),
      known: items.reduce((a, s) => a + (s.duration || 0), 0),
      unknown: items.some((s) => !s.price),
      unknownDuration: items.some((s) => !s.duration),
    };
  }

  function sync() {
    if (!DATA) return; // the catalogue hasn't loaded yet
    cartStore.set(cart);
    $$(".svc").forEach((li) => {
      const on = cart.includes(li.dataset.id);
      li.classList.toggle("is-added", on);
      $(".add", li).setAttribute("aria-pressed", on);
      $(".add", li).setAttribute("aria-label", `${on ? "Quitar" : "Agregar"} ${svc(li.dataset.id).name}`);
    });
    const t = totals();
    const n = cart.length;
    bar.classList.toggle("show", n > 0);
    idle.classList.toggle("show", n === 0);
    bar.inert = n === 0;
    idle.inert = n > 0;
    $("#bar-count").textContent = `${n} servicio${n === 1 ? "" : "s"}`;
    $("#bar-detail").textContent = [t.price ? money(t.price) + (t.unknown ? " + consultar" : "") : "A consultar", t.known ? dur(t.known) : ""].filter(Boolean).join(" · ");
    if (root.classList.contains("sheet-open") && !$("#sheet-form").hidden) renderSheet();
    if (!n && root.classList.contains("sheet-open") && !$("#sheet-form").hidden) closeSheet();
  }

  // who can do everything in the cart
  const staffOptions = () => eligibleStaff(DATA, cart);
  function startsFor(key, need) {
    const people = staffOptions().filter((st) => !booking.staff || st.id === booking.staff);
    const all = new Set();
    people.forEach((st) => freeStarts(DATA, st, key, need).forEach((m) => all.add(m)));
    return [...all].sort((a, b) => a - b);
  }
  function hasHours(key) {
    return staffOptions().some((st) => (!booking.staff || st.id === booking.staff) && blocksFor(DATA, st, key).length);
  }

  function renderSheet() {
    const t = totals();
    $("#picked").innerHTML = t.items.map((s) => `
      <li><span>${esc(s.name)}</span><span class="p">${s.price ? money(s.price) : "Consultar"}</span>
      <button class="rm" type="button" data-rm="${esc(s.id)}" aria-label="Quitar ${esc(s.name)}">×</button></li>`).join("");
    $("#tot-price").textContent = t.price ? money(t.price) + (t.unknown ? " + consultar" : "") : "A consultar";
    $("#tot-min").textContent = t.unknownDuration ? `aprox. ${dur(t.need)}` : dur(t.need);

    // professionals: only asked when there's more than one
    const people = staffOptions();
    if (booking.staff && !people.some((p) => p.id === booking.staff)) booking.staff = null;
    $("#staff-step").hidden = DATA.staff.length < 2;
    $("#staff-pills").innerHTML = [{ id: "", name: "Cualquiera" }, ...people].map((p) => `
      <button type="button" class="pill" data-staff="${esc(p.id)}" aria-pressed="${(booking.staff || "") === p.id}">${esc(p.name)}${p.role ? `<small>${esc(p.role)}</small>` : ""}</button>`).join("");

    // days with free times; full days stay visible but disabled
    const now = nowInSalon();
    const days = [];
    for (let i = 0; i <= SETTINGS.booking_days; i++) {
      const key = addDays(now.key, i);
      if (!hasHours(key)) continue;
      const starts = startsFor(key, t.need);
      if (i === 0 && !starts.length) continue;
      days.push({ key, i, starts });
    }
    if (booking.day && !days.some((d) => d.key === booking.day && d.starts.length)) { booking.day = null; booking.slot = null; }
    $("#days").innerHTML = days.length ? days.map((d) => `<button type="button" class="pill pill-day" data-day="${d.key}" aria-pressed="${booking.day === d.key}"${d.starts.length ? "" : " disabled"}>
        ${d.i === 0 ? "Hoy" : d.i === 1 ? "Mañana" : DAYS_SHORT[dowOf(d.key)]}<small>${d.starts.length ? shortDate(d.key) : "Completo"}</small></button>`).join("")
      : `<p class="slot-note">No hay días con horario disponible en las próximas semanas.</p>`;

    const slotsEl = $("#slots"), note = $("#slot-note");
    note.textContent = "";
    const longest = Math.max(0, ...people.flatMap((st) => (st.hours || SETTINGS.hours).flat().map(([o, c]) => c - o)));
    if (!people.length) {
      slotsEl.innerHTML = "";
      note.textContent = "Estos servicios los hacen profesionales distintas. Escribile a Mica y lo coordinan.";
    } else if (t.need > longest) {
      slotsEl.innerHTML = "";
      note.textContent = `Tu combinación dura ${dur(t.need)}, más que un bloque de atención. Escribile a Mica y lo coordinan juntas.`;
    } else if (!booking.day) {
      slotsEl.innerHTML = `<p class="slot-note">${days.some((d) => d.starts.length) ? "Elegí un día para ver los horarios libres." : "No quedan horarios libres para esta combinación. Escribile a Mica y lo coordinan."}</p>`;
    } else {
      const starts = days.find((d) => d.key === booking.day).starts;
      if (!starts.includes(booking.slot)) booking.slot = null;
      const groups = [["Mañana", starts.filter((m) => m < 720)], ["Tarde", starts.filter((m) => m >= 720)]];
      slotsEl.innerHTML = groups.filter(([, g]) => g.length).map(([label, g]) => `<div class="slot-group">${label}</div><div class="pills">${g.map((m) =>
        `<button type="button" class="pill" data-slot="${m}" aria-pressed="${booking.slot === m}">${hhmm(m)}</button>`).join("")}</div>`).join("");
      note.textContent = t.unknownDuration
        ? "Lo que es a consultar lo calculamos en 1 hora; Mica te avisa si hace falta más tiempo."
        : `Solo mostramos horarios en los que entran tus ${dur(t.need)} de servicio.`;
    }
    $("#book").disabled = !(booking.day && booking.slot != null);
    $("#wa-instead").href = waLink(waMessage(false));
  }

  function openSheet() {
    const m = me.get();
    if (!$("#name").value && m.name) $("#name").value = m.name;
    if (!$("#phone").value && m.phone) $("#phone").value = fmtPhone(m.phone);
    showForm();
    renderSheet();
    root.classList.add("sheet-open");
    focus.open();
    setTimeout(() => $("#sheet .close").focus(), 50);
    // fetch fresh free times while she chooses
    loadData().then(() => { if (root.classList.contains("sheet-open") && !$("#sheet-form").hidden) renderSheet(); }).catch(() => {});
  }
  function closeSheet() {
    root.classList.remove("sheet-open");
    focus.close();
    if (!$("#sheet-done").hidden) showForm();
    (cart.length ? $("#open-sheet") : $(".add"))?.focus({ preventScroll: true });
  }
  function showForm() {
    $("#sheet-form").hidden = false;
    $("#sheet-done").hidden = true;
    $("#sheet-title").textContent = "Tu reserva";
    $("#book-error").hidden = true;
  }

  $("#open-sheet").addEventListener("click", openSheet);
  $("#sheet-backdrop").addEventListener("click", closeSheet);
  $("#sheet .close").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && root.classList.contains("sheet-open")) closeSheet(); });

  sheet.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm]");
    if (rm) { cart = cart.filter((x) => x !== rm.dataset.rm); sync(); return; }
    const st = e.target.closest("[data-staff]");
    if (st) { booking.staff = st.dataset.staff || null; renderSheet(); $(`[data-staff="${st.dataset.staff}"]`, sheet).focus({ preventScroll: true }); return; }
    const day = e.target.closest("[data-day]");
    if (day) {
      booking.day = day.dataset.day; booking.slot = null; renderSheet();
      $(`[data-day="${booking.day}"]`, sheet).focus({ preventScroll: true });
      return;
    }
    const slot = e.target.closest("[data-slot]");
    if (slot) {
      booking.slot = +slot.dataset.slot; renderSheet();
      $(`[data-slot="${booking.slot}"]`, sheet).focus({ preventScroll: true });
      return;
    }
    if (e.target.closest("#done-close")) closeSheet();
  });

  function waMessage(booked) {
    const t = totals();
    const name = $("#name").value.trim();
    const notes = $("#notes").value.trim();
    const when = booking.day
      ? `${DAYS[dowOf(booking.day)].toLowerCase()} ${shortDate(booking.day)}${booking.slot != null ? ` a las ${hhmm(booking.slot)} hs` : ""}`
      : "a coordinar";
    return [
      `¡Hola Mica! 🌸${name ? ` Soy ${name}.` : ""} ${booked ? "Acabo de reservar por la web:" : "Quiero reservar:"}`,
      ...t.items.map((s) => `• ${s.name} (${s.price ? gs(s.price) : "consultar precio"})`),
      "",
      `📅 ${when}`,
      `Total estimado: ${t.price ? gs(t.price) + (currency !== "PYG" ? ` (≈ ${convert(t.price)})` : "") : "a consultar"}${t.price && t.unknown ? " + servicios a consultar" : ""}`,
      ...(notes ? [`📝 ${notes}`] : []),
      "",
      booked ? "¡Gracias!" : "¿Tenés disponible? ¡Gracias!",
    ].join("\n");
  }
  $("#name").addEventListener("input", () => { $("#wa-instead").href = waLink(waMessage(false)); });
  $("#notes").addEventListener("input", () => { $("#wa-instead").href = waLink(waMessage(false)); });

  // ---- confirm ----
  $("#book").addEventListener("click", async () => {
    const err = $("#book-error");
    const name = $("#name").value.trim();
    const phone = normPhone($("#phone").value);
    const fail = (msg, field) => { err.textContent = msg; err.hidden = false; if (field) $(field).focus(); };
    if (!name) return fail("Escribí tu nombre.", "#name");
    if (phone.length < 8 || phone.length > 15) return fail("Revisá tu número de WhatsApp, por ejemplo 0981 123 456.", "#phone");
    err.hidden = true;
    const btn = $("#book");
    btn.disabled = true; btn.textContent = "Reservando…";
    try {
      const db = await DB;
      const res = await db.book({
        service_ids: cart, staff_id: booking.staff, date: booking.day, start: booking.slot,
        name, phone, notes: $("#notes").value.trim(),
      });
      const m = me.get();
      m.name = name; m.phone = phone;
      m.bookings = [...(m.bookings || []), {
        id: res.id, staff_id: res.staff_id, date: res.date, start_min: res.start_min, end_min: res.end_min,
        names: totals().items.map((s) => s.name),
      }].slice(-20);
      me.set(m);
      showDone(res, name);
      loadData().catch(() => {});
    } catch (e) {
      fail(e.message || "No se pudo reservar. Probá de nuevo.");
      await loadData().catch(() => {});
      renderSheet();
    } finally {
      btn.textContent = "Confirmar reserva";
      btn.disabled = !(booking.day && booking.slot != null);
    }
  });

  function showDone(res, name) {
    const t = totals();
    const who = DATA.staff.find((s) => s.id === res.staff_id);
    const pending = res.status === "pending";
    $("#sheet-title").textContent = pending ? "¡Pedido enviado!" : "¡Turno reservado!";
    $("#sheet-done").innerHTML = `
      <div class="done-mark" aria-hidden="true"><svg class="sparkle"><use href="#i-sparkle"/></svg></div>
      <p class="done-lead">${pending
        ? `Gracias, ${esc(name.split(" ")[0])}. Mica revisa tu pedido y te confirma por WhatsApp.`
        : `¡Listo, ${esc(name.split(" ")[0])}! Te esperamos.`}</p>
      <div class="done-card">
        <strong>${longDate(res.date)} · ${hhmm(res.start_min)} hs</strong>
        <span>${t.items.map((s) => esc(s.name)).join(" · ")}</span>
        <span class="muted">${who && DATA.staff.length > 1 ? `con ${esc(who.name)} · ` : ""}${t.unknownDuration ? "aprox. " : ""}${dur(res.end_min - res.start_min)}</span>
        <span class="price">${t.price ? gs(t.price) + (t.unknown ? " + consultar" : "") : "Precio a consultar"}</span>
      </div>
      <a class="btn btn-wa send" href="${waLink(waMessage(true))}" target="_blank" rel="noopener"><svg><use href="#i-wa"/></svg>Avisarle a Mica por WhatsApp</a>
      <button class="btn btn-ghost send" id="done-close" type="button">Listo</button>
      <p class="fine">Si necesitás cambiar o cancelar el turno, escribile a Mica.</p>`;
    $("#sheet-form").hidden = true;
    $("#sheet-done").hidden = false;
    $("#sheet-done").focus();
    sheet.scrollTop = 0;
    // the booking is done: start fresh even if she leaves without tapping "Listo"
    cart = []; booking.day = booking.slot = null;
    $("#notes").value = "";
    sync();
    renderMe();
  }

  // ---- "tu próximo turno" / "¿volvés?" card ----
  renderMe = () => {
    const box = $("#me-card");
    const m = me.get();
    const now = nowInSalon();
    // a booking Mica cancelled no longer shows up among the taken times
    const live = (b) => (DATA.busy || []).some((x) => x.staff_id === b.staff_id && x.date === b.date && x.start_min === b.start_min);
    const next = (m.bookings || [])
      .filter((b) => (b.date > now.key || (b.date === now.key && b.end_min > now.minute)) && live(b))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min)[0];
    const last = (m.bookings || []).filter((b) => b.date < now.key).map((b) => b.date).sort().at(-1);
    const first = esc((m.name || "").split(" ")[0]);
    if (next) {
      box.innerHTML = `<div class="me-card">
        <span class="eyebrow"><svg class="sparkle"><use href="#i-sparkle"/></svg>Tu próximo turno</span>
        <strong>${longDate(next.date)} · ${hhmm(next.start_min)} hs</strong>
        <small>${esc(next.names.join(" · "))}</small>
        <a class="link" href="${waLink(`¡Hola Mica! 🌸 Soy ${m.name}. Te escribo por mi turno del ${DAYS[dowOf(next.date)].toLowerCase()} ${shortDate(next.date)} a las ${hhmm(next.start_min)}.`)}" target="_blank" rel="noopener">¿Cambiar o cancelar? Escribile a Mica</a>
      </div>`;
    } else if (last && daysBetween(last, now.key) >= SETTINGS.reminder_days) {
      box.innerHTML = `<div class="me-card">
        <span class="eyebrow"><svg class="sparkle"><use href="#i-sparkle"/></svg>${first ? `¡Hola, ${first}!` : "¡Hola!"}</span>
        <strong>Ya pasaron ${daysBetween(last, now.key)} días desde tu último turno</strong>
        <small>¿Reservamos tu retoque? Elegí tus servicios acá abajo.</small>
      </div>`;
    } else box.innerHTML = "";
  };

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
  }

  document.addEventListener("currencychange", sync);
}

/* =========================================================
   SALÓN view
   ========================================================= */
const GALLERY = [
  ["esculpidas-semi", "Esculpidas con diseño de flores"],
  ["unas-hello-kitty", "Francesitas con diseño de Hello Kitty"],
  ["ext-griego", "Extensiones volumen griego"],
  ["peluqueria", "Ondas"],
  ["softgel", "Softgel con diseño de flor"],
  ["unas-estrellas", "Diseño de estrellas"],
  ["lifting", "Lifting de pestañas"],
  ["pelu-balayage", "Color con ondas"],
  ["esculpidas-nude", "Esculpidas nude"],
  ["unas-corazones", "Diseño de corazones"],
  ["ext-brasilero", "Extensiones volumen brasilero"],
  ["pelu-ondas", "Rubio con ondas"],
  ["kapping", "Kapping con francesitas"],
  ["unas-hojas", "Diseño de hojas"],
  ["ext-clasicas", "Extensiones clásicas"],
  ["pelu-corte", "Corte en capas"],
  ["unas-disney", "Diseño de Disney"],
  ["extraccion", "Esculpidas"],
  ["spa-pies", "Spa de pies"],
  ["pedicura-tradicional", "Pedicura tradicional"],
];

// category cards with "Desde Gs. X"
function renderCategoryCards() {
  const box = $("#cat-cards");
  if (!box) return;
  box.innerHTML = CATEGORIES.filter((c) => SERVICES.some((s) => s.category_id === c.id)).map((c) => {
    const prices = SERVICES.filter((s) => s.category_id === c.id && s.price).map((s) => s.price);
    const from = prices.length ? `<p data-prefix="Desde " data-pyg="${Math.min(...prices)}"></p>` : "<p>Precio por WhatsApp</p>";
    return `<a class="cat-card${c.image ? "" : " ph"}" href="#cat-${esc(c.id)}">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy">` : ""}<div class="txt"><h3>${esc(c.name)}</h3>${from}</div></a>`;
  }).join("");
  paintPrices();
}

function initSalon() {
  const nav = $(".nav");
  if (nav) {
    const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }

  initMicaSlider();

  const g = $("#gallery");
  if (!g) return;
  g.innerHTML = GALLERY.map(([f, alt], i) =>
    `<button type="button" data-i="${i}" aria-label="Ver foto: ${alt}"><img src="images/${f}.webp" alt="${alt}" loading="lazy"></button>`).join("");

  const lb = $("#lightbox"), img = $("img", lb), cap = $("figcaption", lb);
  const focus = modalFocus(lb);
  let cur = 0;
  const show = (i) => {
    cur = (i + GALLERY.length) % GALLERY.length;
    img.src = `images/${GALLERY[cur][0]}.webp`; img.alt = GALLERY[cur][1]; cap.textContent = GALLERY[cur][1];
  };
  const close = () => { lb.classList.remove("open"); focus.close(); };
  g.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    show(+b.dataset.i); lb.classList.add("open"); focus.open(); $(".lb-close", lb).focus();
  });
  $(".lb-close", lb).addEventListener("click", close);
  $(".lb-prev", lb).addEventListener("click", () => show(cur - 1));
  $(".lb-next", lb).addEventListener("click", () => show(cur + 1));
  lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(cur - 1);
    if (e.key === "ArrowRight") show(cur + 1);
  });
  let x0 = null;
  lb.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1));
    x0 = null;
  });
}

// "Sobre mí" photo slider. On wide screens it takes the height of the text next to it.
function initMicaSlider() {
  const slider = $(".mica-slider");
  if (!slider) return;
  const track = $(".ms-track", slider);
  const slides = $$(".ms-slide", slider);
  const dots = $(".ms-dots", slider);
  dots.innerHTML = slides.map((_, i) => `<button type="button" aria-label="Foto ${i + 1}"></button>`).join("");
  const dotBtns = $$("button", dots);

  const current = () => Math.round(track.scrollLeft / track.clientWidth);
  const go = (i) => track.scrollTo({ left: ((i + slides.length) % slides.length) * track.clientWidth, behavior: motion() });
  const paint = () => dotBtns.forEach((d, i) => d.setAttribute("aria-current", i === current()));
  track.addEventListener("scroll", () => requestAnimationFrame(paint), { passive: true });
  dotBtns.forEach((d, i) => d.addEventListener("click", () => { stop(); go(i); }));
  $(".ms-prev", slider).addEventListener("click", () => { stop(); go(current() - 1); });
  $(".ms-next", slider).addEventListener("click", () => { stop(); go(current() + 1); });
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { stop(); go(current() + 1); }
    if (e.key === "ArrowLeft") { stop(); go(current() - 1); }
  });
  paint();

  // gentle autoplay until the visitor touches it
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; };
  slider.addEventListener("focusin", stop);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion.addEventListener("change", (e) => { if (e.matches) stop(); });
  if (!reducedMotion.matches) {
    timer = setInterval(() => { if (!slider.matches(":hover") && slider.offsetParent) go(current() + 1); }, 4500);
    track.addEventListener("pointerdown", stop, { once: true });
    track.addEventListener("touchstart", stop, { once: true, passive: true });
  }

  const text = $(".about-text");
  const wide = matchMedia("(min-width: 861px)");
  const fit = () => {
    const on = wide.matches && !!text;
    slider.classList.toggle("is-fitted", on);
    slider.style.height = on ? text.offsetHeight + "px" : "";
    track.scrollLeft = current() * track.clientWidth;
  };
  if (text && "ResizeObserver" in window) new ResizeObserver(fit).observe(text);
  wide.addEventListener("change", fit);
  fit();
}

/* ---------- two views in one page: "#salon" and the salon sections show the salon view ---------- */
function initViews() {
  const salonIds = ["salon", "sobre", "servicios", "galeria", "gift", "faq", "visita"];
  const reservas = $("#view-reservas"), salon = $("#view-salon");
  function route(id) {
    if (typeof id !== "string") id = location.hash.slice(1);
    const toSalon = salonIds.includes(id);
    reservas.hidden = toSalon; salon.hidden = !toSalon;
    const target = id && id !== "salon" && id !== "reservas" ? document.getElementById(id) : null;
    if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
  }
  addEventListener("hashchange", () => route());
  addEventListener("popstate", () => route());
  // handle in-page links ourselves so they also work inside embedded previews;
  // switching views adds a history entry so "back" returns to the other view
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href").slice(1);
    if (!id) return;
    e.preventDefault();
    const switching = salonIds.includes(id) !== reservas.hidden;
    try { history[switching ? "pushState" : "replaceState"](null, "", "#" + id); } catch {}
    route(id);
  });
  route();
}

/* ---------- data ---------- */
function applyData(d) {
  DATA = d;
  SETTINGS = { ...SEED.settings, ...d.settings };
  DATA.settings = SETTINGS;
  SERVICES = [...d.services].sort((a, b) => a.sort - b.sort);
  CATEGORIES = [...d.categories].sort((a, b) => a.sort - b.sort);
  renderCatalog();
  renderCategoryCards();
  renderStatus();
  renderHours();
  wireWhatsAppLinks();
  renderMe();
  paintPrices();
}

let loading = null;
function loadData() {
  loading ||= DB.then((db) => db.loadPublic().then((d) => {
    if (db.mode !== "demo") saved.set(PUBLIC_CACHE, { ...d, busy: [] });
    applyData(d);
  })).finally(() => { loading = null; });
  return loading;
}

/* ---------- boot ---------- */
initTheme();
initViews();
initReservas();
initSalon();
initCurrency();
wireWhatsAppLinks();
const cachedData = saved.get(PUBLIC_CACHE);
if (cachedData && CFG.supabaseUrl) applyData(cachedData);
loadData().catch(() => {
  if (DATA) return;
  $("#services").innerHTML = `<p class="loading">No pudimos cargar los servicios. Revisá tu conexión y recargá la página, o <a data-wa href="#">escribile a Mica</a>.</p>`;
  wireWhatsAppLinks();
});
setInterval(renderStatus, 60000);
