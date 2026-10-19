/* Blossom Beauty Salon — shared by the public page (index.html) and Mica's panel (admin.html).

   Data lives in Supabase when config.js has the project keys. Without them everything runs in
   "modo demo": the same features, but the data is stored only in this browser.
   SEED below is the starting catalogue in both cases (supabase/schema.sql loads the same data). */

const CFG = window.BLOSSOM_CONFIG || {};
const TZ = "America/Asuncion";
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const toMin = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
const dur = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}`);
const gs = (n) => "Gs. " + Math.round(n || 0).toLocaleString("es-PY").replace(/,/g, ".");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const motion = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth");
const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
const saved = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// Paraguayan numbers: "0981 123 456", "981123456" and "+595 981 123 456" all become 595981123456
function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(d)) d = "595" + d.slice(1);
  else if (/^9\d{8}$/.test(d)) d = "595" + d;
  return d;
}
const fmtPhone = (d) => (!d ? "" : /^595\d{9}$/.test(d) ? `+595 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : "+" + d);
const waLink = (text, phone) => `https://wa.me/${phone || SETTINGS.whatsapp}?text=${encodeURIComponent(text)}`;

/* ---------- dates: "YYYY-MM-DD" keys and minutes from midnight, always in salon time ---------- */
const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const keyOf = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (k, n) => { const d = parseKey(k); d.setUTCDate(d.getUTCDate() + n); return keyOf(d); };
const dowOf = (k) => parseKey(k).getUTCDay();
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);
const shortDate = (k) => `${+k.slice(8)}/${+k.slice(5, 7)}`;
const longDate = (k) => `${DAYS[dowOf(k)]} ${+k.slice(8)} de ${MONTHS[+k.slice(5, 7) - 1]}`;

function nowInSalon() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  const key = `${get("year")}-${get("month")}-${get("day")}`;
  return { key, day: dowOf(key), minute: +get("hour") * 60 + +get("minute") };
}

/* ---------- starting data ---------- */
const WEEK = [[480, 720], [840, 1140]]; // 08:00–12:00 and 14:00–19:00

const SEED = {
  settings: {
    business_name: "Blossom Beauty Salon",
    owner_name: "Micaela",
    whatsapp: "595981676610",
    instagram: "https://www.instagram.com/blossomnails.py/",
    address: "Paz del Chaco c/ Boquerón",
    city: "Fernando de la Mora, zona sur",
    // [open, close] in minutes from midnight; index 0 = domingo
    hours: [[], WEEK, WEEK, WEEK, WEEK, WEEK, WEEK],
    booking_days: 14,     // how far ahead clients can book
    slot_step: 30,        // start times offered every N minutes
    min_notice: 60,       // minutes of notice for same-day bookings
    default_duration: 60, // used when a service has no duration yet
    auto_confirm: true,
    reminder_days: 21,
    reminder_text: "¡Hola {nombre}! 🌸 Ya pasaron {dias} días desde tu último turno en Blossom. ¿Reservamos tu retoque? Elegí día y horario acá: {link}",
  },
  categories: [
    { id: "manos", name: "Manos", image: "images/manicura-semi.webp", sort: 0 },
    { id: "esculpidas", name: "Extensión", image: "images/esculpidas-semi.webp", sort: 1 },
    { id: "pies", name: "Pies", image: "images/pedicura-tradicional.webp", sort: 2 },
    { id: "pestanas", name: "Pestañas", image: "images/ext-clasicas.webp", sort: 3 },
    { id: "peluqueria", name: "Peluquería", image: null, sort: 4 },
  ],
  // price: guaraníes, or null = "Consultar". duration: minutes (null = a confirmar)
  services: [
    ["mani-trad", "manos", "Manicura tradicional", 35000, 30, "manicura-tradicional"],
    ["mani-semi", "manos", "Manicura semipermanente", 70000, 50, "manicura-semi", "Sobre el largor de tus uñas naturales. Retoque cada 21 días."],
    ["rubber", "manos", "Base rubber + semipermanente", 110000, 60, "rubber-semi"],
    ["kapping", "manos", "Kapping + semipermanente", 130000, 105, "kapping", "Acrílico o polygel, hasta largor 2. Diseños: cotizá por WhatsApp. Retoque cada 21 días."],
    ["extraccion", "manos", "Extracción", 60000, 45, "extraccion", "Acrílico, polygel o gel. Incluye manicura tradicional."],
    ["esc-nude", "esculpidas", "Esculpidas acrílicas nude", 130000, 60, "esculpidas-nude", "Hasta largor 2. Retoque cada 21 días."],
    ["softgel", "esculpidas", "Softgel", 130000, 90, "softgel", "Incluye semipermanente. Diseños: cotizá por WhatsApp. Retoque cada 21 días."],
    ["esc-semi", "esculpidas", "Esculpidas + semipermanente", 160000, 105, "esculpidas-semi", "Acrílico o polygel, hasta largor 2. Diseños: cotizá por WhatsApp. Retoque cada 21 días."],
    ["pedi-trad", "pies", "Pedicura tradicional", 50000, 45, "pedicura-tradicional"],
    ["pedi-semi", "pies", "Pedicura semipermanente", 80000, 50, "pedicura-semi", "Color de larga duración y brillo impecable por 1 mes."],
    ["spa-pies", "pies", "Spa de pies premium 👑", 140000, 90, "spa-pies", "Pedicura profunda con hidromasaje, aromaterapia, reflexología y parafina. Incluye semipermanente."],
    ["ext-clasicas", "pestanas", "Extensiones clásicas", 160000, 180, "ext-clasicas"],
    ["ext-griego", "pestanas", "Extensiones volumen griego", 180000, 180, "ext-griego", "Efecto tupido."],
    ["ext-brasilero", "pestanas", "Extensiones volumen brasilero", 180000, 180, "ext-brasilero", "Efecto semitupido."],
    ["lifting", "pestanas", "Lifting de pestañas", null, null, null, "Precio y duración por WhatsApp."],
    ["pelu", "peluqueria", "Servicios de peluquería", null, null, null, "Contanos qué querés hacerte y te pasamos precio y turno."],
  ].map(([id, category_id, name, price, duration, img, description], sort) => ({
    id, category_id, name, price, duration, sort, active: true,
    image: img ? `images/${img}.webp` : null, description: description || null,
  })),
  staff: [
    // hours: null = the salon's hours. service_ids: null = every service
    { id: "mica", name: "Mica", role: "Manicurista", active: true, sort: 0, hours: null, service_ids: null },
  ],
  clients: [],
  appointments: [],
  exceptions: [], // special days: { date, staff_id (null = whole salon), blocks ([] = closed), note }
};

let SETTINGS = { ...SEED.settings };

/* ---------- availability (the same rules run again in the database when booking) ---------- */
const OFF = ["cancelled", "no_show"];

function eligibleStaff(data, serviceIds = []) {
  return data.staff
    .filter((st) => st.active && (!st.service_ids || serviceIds.every((id) => st.service_ids.includes(id))))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

function exceptionFor(data, staffId, key) {
  return data.exceptions.find((e) => e.date === key && e.staff_id === staffId)
    || data.exceptions.find((e) => e.date === key && !e.staff_id);
}

// opening blocks for one person on one day
function blocksFor(data, staff, key) {
  const ex = exceptionFor(data, staff?.id, key);
  if (ex) return ex.blocks || [];
  return ((staff && staff.hours) || data.settings.hours)[dowOf(key)] || [];
}

// the salon's own hours on a day (for the open/closed badge)
function salonBlocks(data, key) {
  const ex = data.exceptions.find((e) => e.date === key && !e.staff_id);
  return ex ? ex.blocks || [] : data.settings.hours[dowOf(key)] || [];
}

function busyOf(data, staffId, key, ignoreId) {
  return (data.appointments || data.busy || [])
    .filter((a) => a.staff_id === staffId && a.date === key && !OFF.includes(a.status) && (!ignoreId || a.id !== ignoreId))
    .map((a) => [a.start_min, a.end_min]);
}

function isFree(data, staff, key, from, to, ignoreId) {
  return blocksFor(data, staff, key).some(([o, c]) => from >= o && to <= c)
    && !busyOf(data, staff.id, key, ignoreId).some(([a, b]) => from < b && to > a);
}

// start times (minutes) where `need` minutes fit for this person, honouring the booking notice
function freeStarts(data, staff, key, need, { ignoreId, now = nowInSalon(), notice = data.settings.min_notice } = {}) {
  const step = data.settings.slot_step || 30;
  const taken = busyOf(data, staff.id, key, ignoreId);
  const out = [];
  if (key < now.key) return out;
  for (const [o, c] of blocksFor(data, staff, key)) {
    for (let m = o; m + need <= c; m += step) {
      if (key === now.key && m < now.minute + notice) continue;
      if (taken.some(([a, b]) => m < b && m + need > a)) continue;
      out.push(m);
    }
  }
  return out;
}

const lineOf = (s, def) => ({ service_id: s.id, name: s.name, price: s.price, duration: s.duration || def });

// Works out a web booking: which professional takes it, the price and the length. Mirrors book() in schema.sql.
function planBooking(data, { service_ids, staff_id, date, start }, now = nowInSalon()) {
  const s = data.settings;
  const services = service_ids.map((id) => data.services.find((x) => x.id === id && x.active));
  if (!services.length || services.some((x) => !x)) return { error: "Algún servicio ya no está disponible. Recargá la página." };
  const items = services.map((x) => lineOf(x, s.default_duration));
  const duration = items.reduce((a, x) => a + x.duration, 0);
  const total = items.reduce((a, x) => a + (x.price || 0), 0);
  if (date < now.key || date > addDays(now.key, s.booking_days)) return { error: "Ese día no está disponible para reservar." };
  if (date === now.key && start < now.minute + s.min_notice) return { error: "Ese horario ya pasó o está muy cerca. Elegí otro." };
  const staff = eligibleStaff(data, service_ids)
    .filter((st) => !staff_id || st.id === staff_id)
    .find((st) => isFree(data, st, date, start, start + duration));
  if (!staff) return { error: "Ese horario se acaba de ocupar. Elegí otro, por favor." };
  return { staff, items, duration, total };
}

/* ---------- clients ---------- */
// last visit, next appointment and whether it's time to invite her back
function clientStats(data, client, now = nowInSalon()) {
  const mine = data.appointments.filter((a) => a.kind !== "block" && a.client_id === client.id);
  const done = mine.filter((a) => a.status === "confirmed" && (a.date < now.key || (a.date === now.key && a.end_min <= now.minute)));
  const upcoming = mine.filter((a) => !OFF.includes(a.status) && (a.date > now.key || (a.date === now.key && a.end_min > now.minute)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min);
  const last = done.reduce((m, a) => (!m || a.date > m ? a.date : m), null);
  const since = last ? daysBetween(last, now.key) : null;
  const reminded = client.reminded_at && last && client.reminded_at >= last;
  return {
    visits: done.length, spent: done.reduce((t, a) => t + (a.total || 0), 0),
    last, since, next: upcoming[0] || null,
    due: !!last && since >= data.settings.reminder_days && !upcoming.length && !reminded,
    reminded: !!reminded,
  };
}

function reminderText(data, client, since) {
  const link = location.origin + location.pathname.replace(/[^/]*$/, "");
  return data.settings.reminder_text
    .replace(/\{nombre\}/g, client.name.split(" ")[0])
    .replace(/\{dias\}/g, since)
    .replace(/\{link\}/g, link);
}

/* ---------- photos: resized in the browser before upload ---------- */
async function resizeImage(file, max) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/webp", 0.82));
}

/* =========================================================
   Storage adapters. Both expose the same methods.
   ========================================================= */
const TABLES = ["categories", "services", "staff", "clients", "appointments", "exceptions"];

function publicView(d, today) {
  return {
    settings: d.settings,
    categories: d.categories,
    services: d.services.filter((s) => s.active),
    staff: d.staff.filter((s) => s.active),
    exceptions: d.exceptions.filter((e) => e.date >= today),
    busy: d.appointments.filter((a) => a.date >= today && !OFF.includes(a.status))
      .map(({ staff_id, date, start_min, end_min }) => ({ staff_id, date, start_min, end_min })),
  };
}

// ---- modo demo: one JSON document in localStorage ----
const LocalDB = {
  mode: "demo",
  key: "blossom-demo-db",
  read() {
    const d = saved.get(this.key);
    if (d && d.settings) return { ...structuredClone(SEED), ...d, settings: { ...SEED.settings, ...d.settings } };
    return structuredClone(SEED);
  },
  write(d) {
    try { localStorage.setItem(this.key, JSON.stringify(d)); }
    catch { throw new Error("No hay más espacio en este navegador. Probá con fotos más livianas."); }
  },
  async loadPublic() { return publicView(this.read(), nowInSalon().key); },
  async loadAll() { return this.read(); },
  async save(table, row) {
    const d = this.read();
    const r = { ...row, id: row.id || uid() };
    if (table === "clients" && r.phone && d.clients.some((c) => c.phone === r.phone && c.id !== r.id)) {
      throw new Error("Ya hay una clienta con ese número.");
    }
    const i = d[table].findIndex((x) => x.id === r.id);
    if (i >= 0) d[table][i] = r; else d[table].push(r);
    this.write(d);
    return r;
  },
  async remove(table, id) {
    const d = this.read();
    d[table] = d[table].filter((x) => x.id !== id);
    if (table === "clients") d.appointments.forEach((a) => { if (a.client_id === id) a.client_id = null; });
    if (table === "staff") d.exceptions = d.exceptions.filter((e) => e.staff_id !== id);
    this.write(d);
  },
  async saveSettings(settings) { const d = this.read(); d.settings = settings; this.write(d); return settings; },
  async book(req) {
    const d = this.read();
    const plan = planBooking(d, req);
    if (plan.error) throw new Error(plan.error);
    const phone = normPhone(req.phone);
    const today = nowInSalon().key;
    if (d.appointments.filter((a) => a.client_phone === phone && a.date >= today && !OFF.includes(a.status)).length >= 3) {
      throw new Error("Ya tenés varios turnos reservados. Escribile a Mica por WhatsApp.");
    }
    let client = d.clients.find((c) => c.phone === phone);
    if (!client) { client = { id: uid(), name: req.name.trim(), phone, notes: null, reminded_at: null, created_at: new Date().toISOString() }; d.clients.push(client); }
    const appt = {
      id: uid(), kind: "appointment", client_id: client.id, client_name: req.name.trim(), client_phone: phone,
      staff_id: plan.staff.id, date: req.date, start_min: req.start, end_min: req.start + plan.duration,
      items: plan.items, total: plan.total, status: d.settings.auto_confirm ? "confirmed" : "pending",
      notes: req.notes?.trim() || null, source: "web", created_at: new Date().toISOString(),
    };
    d.appointments.push(appt);
    this.write(d);
    return appt;
  },
  async uploadImage(file) {
    const blob = await resizeImage(file, 480);
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  },
  auth: {
    async session() { return saved.get("blossom-demo-session"); },
    async signIn(email) { const s = { email: email || "demo" }; saved.set("blossom-demo-session", s); return s; },
    async signOut() { saved.del("blossom-demo-session"); },
    async changePassword() {},
    async isAdmin() { return true; },
  },
  reset() { saved.del(this.key); },
};

// ---- Supabase ----
function SupabaseDB(url, key) {
  const sb = window.supabase.createClient(url, key);
  const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  return {
    mode: "supabase",
    async loadPublic() {
      const today = nowInSalon().key;
      const [st, categories, services, staff, exceptions, busy] = await Promise.all([
        sb.from("settings").select("data").eq("id", 1).maybeSingle(),
        sb.from("categories").select("*").order("sort"),
        sb.from("services").select("*").eq("active", true).order("sort"),
        sb.from("staff").select("*").eq("active", true).order("sort"),
        sb.from("exceptions").select("*").gte("date", today),
        sb.rpc("busy_times", { p_from: today, p_to: addDays(today, 92) }),
      ].map((p) => p.then(must)));
      return { settings: { ...SEED.settings, ...st?.data }, categories, services, staff, exceptions, busy };
    },
    async loadAll() {
      // Supabase answers at most 1000 rows per request, so read each table in pages
      const all = async (t) => {
        const out = [];
        for (let from = 0; ; from += 1000) {
          const rows = must(await sb.from(t).select("*").order("id").range(from, from + 999));
          out.push(...rows);
          if (rows.length < 1000) return out;
        }
      };
      const [st, ...rows] = await Promise.all([
        sb.from("settings").select("data").eq("id", 1).maybeSingle().then(must),
        ...TABLES.map(all),
      ]);
      const out = { settings: { ...SEED.settings, ...st?.data } };
      TABLES.forEach((t, i) => { out[t] = rows[i]; });
      return out;
    },
    async save(table, row) {
      try { return must(await sb.from(table).upsert(row).select().single()); }
      catch (e) { throw new Error(/clients_phone_key|duplicate/.test(e.message) && table === "clients" ? "Ya hay una clienta con ese número." : e.message); }
    },
    async remove(table, id) { must(await sb.from(table).delete().eq("id", id)); },
    async saveSettings(settings) { must(await sb.from("settings").upsert({ id: 1, data: settings })); return settings; },
    async book(r) {
      return must(await sb.rpc("book", {
        p_services: r.service_ids, p_staff: r.staff_id || null, p_date: r.date, p_start: r.start,
        p_name: r.name, p_phone: r.phone, p_notes: r.notes || null,
      }));
    },
    async uploadImage(file) {
      const blob = await resizeImage(file, 900);
      const path = `services/${uid()}.webp`;
      must(await sb.storage.from("media").upload(path, blob, { contentType: "image/webp", cacheControl: "31536000" }));
      return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
    },
    auth: {
      async session() { const { data } = await sb.auth.getSession(); return data.session ? { email: data.session.user.email } : null; },
      async signIn(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(/invalid/i.test(error.message) ? "Email o contraseña incorrectos." : error.message);
      },
      async signOut() { await sb.auth.signOut(); },
      async changePassword(password) { const { error } = await sb.auth.updateUser({ password }); if (error) throw new Error(error.message); },
      async isAdmin() { return !!must(await sb.rpc("is_admin")); },
    },
  };
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("No se pudo conectar. Revisá tu internet."));
    document.head.append(s);
  });
}

// resolves to the adapter in use
const DB = CFG.supabaseUrl && CFG.supabaseAnonKey
  ? loadScript(SUPABASE_JS).then(() => SupabaseDB(CFG.supabaseUrl, CFG.supabaseAnonKey))
  : Promise.resolve(LocalDB);

/* ---------- light / dark ---------- */
function initTheme() {
  const root = document.documentElement;
  const meta = $('meta[name="theme-color"]');
  const stored = () => { try { return localStorage.getItem("blossom-theme"); } catch { return null; } };
  const apply = (t) => {
    root.dataset.theme = t;
    $$(".theme-toggle").forEach((b) => b.setAttribute("aria-checked", t === "dark"));
    if (meta) meta.content = t === "dark" ? "#1c0a13" : "#fbf3f5";
  };
  apply(root.dataset.theme === "dark" ? "dark" : "light");
  $$(".theme-toggle").forEach((b) => b.addEventListener("click", () => {
    const t = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("blossom-theme", t); } catch {}
    apply(t);
  }));
  // follow the device setting until the visitor picks one
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!stored()) apply(e.matches ? "dark" : "light");
  });
}

// Keep keyboard and screen-reader navigation inside an open dialog.
function modalFocus(dialog) {
  let previous, background = [];
  dialog.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const focusable = $$("button, a[href], input, select, textarea, [tabindex='0']", dialog)
      .filter((el) => !el.disabled && el.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  return {
    open() {
      previous = document.activeElement;
      background = [...dialog.parentElement.children].filter((el) =>
        el !== dialog && !el.contains(dialog) && !el.inert && !el.matches(".sheet-backdrop, .toast, script"));
      background.forEach((el) => { el.inert = true; });
      dialog.inert = false;
      dialog.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("modal-open");
    },
    close() {
      background.forEach((el) => { el.inert = false; });
      dialog.inert = true;
      dialog.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("modal-open");
      if (previous && previous.isConnected && !previous.closest("[inert]")) previous.focus({ preventScroll: true });
    },
  };
}
