/* Blossom Beauty Salon — shared by the public page (index.html) and Mica's panel (admin.html).

   Data lives in Supabase when config.js has the project keys. Without them everything runs in
   "modo demo": the same features, but the data is stored only in this browser.
   SEED below is the starting catalogue in both cases (supabase/schema.sql loads the same data). */

const CFG = window.BLOSSOM_CONFIG || {};
const TZ = "America/Asuncion";
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js";

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
    auto_confirm: false,  // web bookings wait for Mica, who confirms by WhatsApp
    // seña: off until Mica sets the amount. deposit_type "fixed" (Gs.) or "percent" (of the total)
    deposit_enabled: false,
    deposit_type: "fixed",
    deposit_value: 0,
    payment_info: "",     // transfer details shown to the client
    appt_reminder_text: "¡Hola {nombre}! 🌸 Te recuerdo tu turno de mañana, {dia} a las {hora}, en Blossom ({servicios}). ¡Te espero!",
    review_url: "",       // her Google review link
    review_text: "¡Gracias por venir, {nombre}! 🌸 Si te gustó cómo quedó, ¿me dejarías una reseña en Google? Me ayuda muchísimo: {link}",
    reminder_days: 21,
    reminder_text: "¡Hola {nombre}! 🌸 Ya pasaron {dias} días desde tu último turno en Blossom. ¿Reservamos tu retoque? Elegí día y horario acá: {link}",
    birthday_gift: "un 10% de descuento",
    birthday_text: "¡Feliz semana de cumple, {nombre}! 🎂🌸 Para festejarte, te regalo {regalo} en tu próximo turno en Blossom. Reservá acá: {link}",
    // shown before booking, one per line; "Título: texto" shows the title in bold
    policies_text: "Puntualidad: si llegás más de 15 minutos tarde, puede que tengamos que reprogramar tu turno.\nCancelación: si no podés venir, avisanos con al menos 24 horas de anticipación.",
  },
  categories: [
    { id: "manos", name: "Manos", image: "images/kapping.webp", sort: 0 },
    { id: "esculpidas", name: "Extensiones", image: "images/esculpidas-semi.webp", sort: 1 },
    { id: "pies", name: "Pies", image: "images/pedicura-tradicional.webp", sort: 2 },
    { id: "pestanas", name: "Pestañas", image: "images/ext-clasicas.webp", sort: 3 },
    { id: "peluqueria", name: "Peluquería", image: "images/peluqueria.webp", sort: 4 },
    { id: "cejas", name: "Cejas", image: null, sort: 4 },
    { id: "maquillaje", name: "Maquillaje", image: null, sort: 6 },
  ],
  // price: guaraníes, or null = "Consultar". duration: minutes (null = a confirmar)
  services: [
    ["mani-trad", "manos", "Manicura tradicional", 35000, 30, "manicura-tradicional"],
    ["mani-semi", "manos", "Manicura semipermanente", 70000, 50, null, "Sobre el largor de tus uñas naturales. Retoque cada 21 días."],
    ["rubber", "manos", "Base rubber + semipermanente", 110000, 60, null],
    ["kapping", "manos", "Kapping + semipermanente", 130000, 105, "kapping", "Refuerzo sobre tu uña natural, sin agregar largo. Gel, acrílico o polygel. Diseños: cotizá por WhatsApp. Retoque cada 21 días."],
    ["extraccion", "manos", "Extracción", 60000, 45, "extraccion", "Acrílico, polygel o gel. Incluye manicura tradicional."],
    ["esc-nude", "esculpidas", "Esculpidas acrílicas nude", 130000, 60, "esculpidas-nude", "Hasta largor 2. Retoque cada 21 días."],
    ["softgel", "esculpidas", "Softgel", 130000, 90, "softgel", "Incluye semipermanente. Diseños: cotizá por WhatsApp. Retoque cada 21 días."],
    ["esc-semi", "esculpidas", "Esculpidas + semipermanente", 160000, 105, "esculpidas-semi", "Acrílico o polygel, hasta largor 2. Diseños: cotizá por WhatsApp. Retoque cada 21 días."],
    ["pedi-trad", "pies", "Pedicura tradicional", 50000, 45, "pedicura-tradicional"],
    ["pedi-semi", "pies", "Pedicura semipermanente", 80000, 50, null, "Color de larga duración y brillo impecable por 1 mes."],
    ["spa-pies", "pies", "Spa de pies premium 👑", 140000, 90, "spa-pies", "Pedicura profunda con hidromasaje, aromaterapia, reflexología y parafina. Incluye semipermanente."],
    ["ext-clasicas", "pestanas", "Extensiones clásicas", 160000, 180, "ext-clasicas"],
    ["ext-griego", "pestanas", "Extensiones volumen griego", 180000, 180, "ext-griego", "Efecto tupido."],
    ["ext-brasilero", "pestanas", "Extensiones volumen brasilero", 180000, 180, "ext-brasilero", "Efecto semitupido."],
    ["lifting", "pestanas", "Lifting de pestañas", 110000, 120, "lifting", "Realza la mirada de forma natural. Dura 30 días."],
    ["pelu", "peluqueria", "Servicios de peluquería", null, null, "pelu-balayage", "Contanos qué querés hacerte y te pasamos precio y turno."],
    // added from Mica's PDF catalogues (2026-10)
    ["kapping-nude", "manos", "Kapping nude", 100000, 105, null, "Refuerzo sobre tu uña natural, sin agregar largo. Gel, acrílico o polygel. Retoque cada 21 días.", 101],
    ["rubber-nude", "manos", "Base rubber nude", 80000, 60, null, "Fortalece uñas naturales finas o quebradizas, sin agregar largo.", 102],
    ["service-kapping-nude", "manos", "Service kapping nude", 100000, null, null, "Mantenimiento de tu kapping.", 103],
    ["service-kapping-semi", "manos", "Service kapping + semipermanente", 110000, null, null, "Mantenimiento de tu kapping con semipermanente.", 104],
    ["service-esc-nude", "esculpidas", "Service esculpidas nude", 100000, null, null, "Mantenimiento de tus esculpidas.", 111],
    ["service-esc-semi", "esculpidas", "Service esculpidas + semipermanente", 130000, null, null, "Mantenimiento de tus esculpidas con semipermanente.", 112],
    ["service-softgel", "esculpidas", "Service softgel", 110000, null, null, "Mantenimiento de tu softgel.", 113],
    ["ext-hawaiano", "pestanas", "Extensiones volumen hawaiano", 180000, 180, null, null, 121],
    ["ext-foxy", "pestanas", "Extensiones foxy eyes", 200000, 180, null, null, 122],
    ["ext-anime", "pestanas", "Extensiones efecto anime", 200000, 180, null, null, 123],
    ["mant-clasicas", "pestanas", "Mantenimiento clásicas", 140000, null, null, "Cada 15 a 29 días. Después de 30 días se cobra como colocación nueva.", 124],
    ["mant-volumen", "pestanas", "Mantenimiento volumen (brasilero, hawaiano o griego)", 160000, null, null, "Cada 15 a 29 días. Después de 30 días se cobra como colocación nueva.", 125],
    ["mant-foxy-anime", "pestanas", "Mantenimiento foxy eyes o efecto anime", 180000, null, null, "Cada 15 a 29 días. Después de 30 días se cobra como colocación nueva.", 126],
    ["laminacion-cejas", "cejas", "Laminación de cejas", 130000, 120, null, "Para una mirada más marcada. Incluye tinte. Dura 30 días.", 131],
    ["cejas-hilo", "cejas", "Diseño de cejas + depilación con hilo", 40000, null, null, null, 132],
    ["cejas-hilo-henna", "cejas", "Diseño de cejas + depilación con hilo + henna", 70000, null, null, null, 133],
    ["cejas-perfilado-henna", "cejas", "Diseño de cejas + perfilado + henna", 50000, null, null, null, 134],
    ["cejas-cera", "cejas", "Depilación con cera: cejas, bozo y mentón", 50000, null, null, "Incluye el diseño de cejas.", 135],
    ["cejas-marcacion", "cejas", "Diseño de cejas + perfilado + marcación", 25000, null, null, null, 136],
    ["pelu-bano", "peluqueria", "Baño capilar", 20000, null, null, null, 141],
    ["pelu-bano-alfaparf", "peluqueria", "Baño Alfaparf Semi di Lino", 50000, null, null, null, 142],
    ["pelu-bano-mascarilla", "peluqueria", "Baño Alfaparf + mascarilla", 70000, null, null, null, 143],
    ["pelu-secado", "peluqueria", "Secado", 15000, null, null, null, 144],
    ["pelu-secado-difusor", "peluqueria", "Secado con difusor", 20000, null, null, null, 145],
    ["pelu-brushing", "peluqueria", "Brushing", 40000, null, null, "Precio desde Gs. 40.000, según el largo.", 146],
    ["pelu-brushing-mov", "peluqueria", "Brushing con movimiento", 50000, null, null, null, 147],
    ["pelu-brushing-plancha", "peluqueria", "Brushing + planchita", 60000, null, null, null, 148],
    ["pelu-ondas", "peluqueria", "Ondas", 70000, null, "pelu-ondas", null, 149],
    ["pelu-corte", "peluqueria", "Corte", 30000, null, "pelu-corte", "Precio desde Gs. 30.000.", 150],
    ["pelu-semi-recogido", "peluqueria", "Peinado semi recogido", 80000, null, null, null, 151],
    ["pelu-recogido", "peluqueria", "Peinado recogido", 100000, null, null, null, 152],
    ["pelu-peinado-ninas", "peluqueria", "Peinado para niñas", 30000, null, null, "Precio desde Gs. 30.000.", 153],
    ["pelu-colageno", "peluqueria", "Colágeno", 90000, null, null, "Para cabello seco y deshidratado: hidrata y da suavidad y brillo. Incluye brushing y acabado profesional.", 154],
    ["pelu-keratina", "peluqueria", "Keratina", 120000, null, null, "Para cabello con frizz, poroso o difícil de manejar. Incluye brushing y acabado profesional.", 155],
    ["pelu-botox", "peluqueria", "Botox capilar", 120000, null, null, "Para cabello dañado, débil o con frizz. Incluye brushing y acabado profesional.", 156],
    ["pelu-alisado-organico", "peluqueria", "Alisado orgánico", 250000, null, null, "Incluye brushing y acabado profesional.", 157],
    ["pelu-alisado-progresivo", "peluqueria", "Alisado progresivo", 200000, null, null, "Incluye brushing y acabado profesional.", 158],
    ["pelu-raiz", "peluqueria", "Retoque de raíz", 170000, null, null, "Incluye brushing y acabado profesional.", 159],
    ["pelu-matizacion", "peluqueria", "Matización", 130000, null, null, "Incluye brushing y acabado profesional.", 160],
    ["pelu-balayage", "peluqueria", "Balayage", 450000, null, "pelu-balayage", "Incluye brushing y acabado profesional.", 161],
    ["pelu-morena", "peluqueria", "Morena iluminada", 300000, null, null, "Incluye brushing y acabado profesional.", 162],
    ["pelu-mechas", "peluqueria", "Mechas tradicionales", 350000, null, null, "Incluye brushing y acabado profesional.", 163],
    ["pelu-combo-brushing", "peluqueria", "Combo: lavado + brushing + planchita", 80000, null, null, "Válido de lunes a jueves.", 164],
    ["pelu-combo-alfaparf", "peluqueria", "Combo: tratamiento Alfaparf + corte + secado", 100000, null, null, "Válido de lunes a jueves.", 165],
    ["makeup-express", "maquillaje", "Makeup express", 130000, null, null, "Limpieza facial exprés, base sin correcciones y ojos en tonos suaves. Pestañas postizas de regalo.", 171],
    ["makeup-social", "maquillaje", "Social makeup", 230000, null, null, "Preparación de piel, base de alta cobertura, contorno, ojos definidos y fijación. Pestañas postizas de regalo.", 172],
  ].map(([id, category_id, name, price, duration, img, description, sort], i) => ({
    id, category_id, name, price, duration, sort: sort ?? i, active: true,
    image: img ? `images/${img}.webp` : null, description: description || null,
  })),
  staff: [
    // hours: null = the salon's hours. service_ids: null = every service
    { id: "mica", name: "Mica", role: "Manicurista", active: true, sort: 0, hours: null, service_ids: null },
  ],
  clients: [],
  appointments: [],
  expenses: [], // what the salon spends: { date, category, description, amount, fixed (repeats every month) }
  exceptions: [], // special days: { date, staff_id (null = whole salon), blocks ([] = closed), note }
  // extras added to a service. category_ids: null = offered with every service
  addons: [
    { id: "largor-3", name: "Largor 3 o 4", price: 10000, duration: 0, category_ids: ["esculpidas"], active: true, sort: 1 },
    { id: "largor-5", name: "Largor 5 o más", price: 20000, duration: 0, category_ids: ["esculpidas"], active: true, sort: 2 },
    { id: "francesitas", name: "Francesitas", price: 20000, duration: 0, category_ids: ["manos", "esculpidas"], active: true, sort: 3 },
    { id: "ojo-gato", name: "Ojo de gato", price: 20000, duration: 0, category_ids: ["manos", "esculpidas"], active: true, sort: 4 },
    { id: "reconstruccion", name: "Reconstrucción de una uña", price: 10000, duration: 0, category_ids: ["manos", "esculpidas"], active: true, sort: 5 },
    { id: "extraccion-semi", name: "Extracción de semipermanente (incluye manicura)", price: 30000, duration: 0, category_ids: ["manos", "esculpidas"], active: true, sort: 6 },
    { id: "extraccion-acrilico", name: "Extracción de acrílico, polygel, softgel o kapping (incluye manicura)", price: 50000, duration: 0, category_ids: ["manos", "esculpidas"], active: true, sort: 7 },
  ],
  // photos of her work on the salon page
  gallery: [
    ["esculpidas-semi", "Extensiones con diseño de flores"],
    ["unas-hello-kitty", "Francesitas con diseño de Hello Kitty"],
    ["ext-griego", "Extensiones volumen griego"],
    ["unas-celeste-rosa", "Diseño en celeste y rosa"],
    ["peluqueria", "Ondas"],
    ["softgel", "Softgel con diseño de flor"],
    ["unas-estrellas", "Diseño de estrellas"],
    ["lifting", "Lifting de pestañas"],
    ["unas-bordo", "Diseño en bordó"],
    ["pelu-balayage", "Color con ondas"],
    ["esculpidas-nude", "Extensiones nude"],
    ["unas-corazones", "Diseño de corazones"],
    ["ext-brasilero", "Extensiones volumen brasilero"],
    ["unas-strass", "Rosa con strass"],
    ["pelu-ondas", "Rubio con ondas"],
    ["kapping", "Kapping con francesitas"],
    ["unas-hojas", "Diseño de hojas"],
    ["unas-blanco-negro", "Diseño en blanco y negro"],
    ["ext-clasicas", "Extensiones clásicas"],
    ["pelu-corte", "Corte en capas"],
    ["unas-disney", "Diseño de Disney"],
    ["unas-carey", "Carey y estrellas"],
    ["extraccion", "Extensiones"],
    ["spa-pies", "Spa de pies"],
    ["pedicura-tradicional", "Pedicura tradicional"],
  ].map(([img, caption], sort) => ({ id: `g${pad(sort + 1)}`, image: `images/${img}.webp`, caption, active: true, sort })),
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

// The day's closing time is the last start time: that turn may run past it.
// Before a pause, the turn has to end in time for it.
function fitsHours(blocks, from, to) {
  const last = Math.max(...blocks.map(([, c]) => c));
  return blocks.some(([o, c]) => from >= o && (to <= c || (c === last && from <= c)));
}

function isFree(data, staff, key, from, to, ignoreId) {
  return fitsHours(blocksFor(data, staff, key), from, to)
    && !busyOf(data, staff.id, key, ignoreId).some(([a, b]) => from < b && to > a);
}

// start times (minutes) where `need` minutes fit for this person, honouring the booking notice
function freeStarts(data, staff, key, need, { ignoreId, now = nowInSalon(), notice = data.settings.min_notice } = {}) {
  const step = data.settings.slot_step || 30;
  const taken = busyOf(data, staff.id, key, ignoreId);
  const out = [];
  if (key < now.key) return out;
  const blocks = blocksFor(data, staff, key);
  const last = Math.max(...blocks.map(([, c]) => c));
  for (const [o, c] of blocks) {
    for (let m = o; c === last ? m <= c : m + need <= c; m += step) {
      if (key === now.key && m < now.minute + notice) continue;
      if (taken.some(([a, b]) => m < b && m + need > a)) continue;
      out.push(m);
    }
  }
  return out;
}

const lineOf = (s, def) => ({ service_id: s.id, name: s.name, price: s.price, duration: s.duration || def });
const addonLine = (a) => ({ addon_id: a.id, name: a.name, price: a.price, duration: a.duration || 0 });

// add-ons offered with these services (by category)
function addonsFor(data, serviceIds) {
  const cats = new Set(serviceIds.map((id) => data.services.find((x) => x.id === id)?.category_id));
  return (data.addons || []).filter((a) => a.active && (!a.category_ids || a.category_ids.some((c) => cats.has(c))))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

// seña for a total: a fixed amount (never more than the total) or a percentage rounded to thousands
function depositFor(s, total) {
  if (!s.deposit_enabled || !(s.deposit_value > 0)) return 0;
  if (s.deposit_type === "percent") return Math.round((total * s.deposit_value) / 100000) * 1000;
  return total > 0 ? Math.min(s.deposit_value, total) : s.deposit_value;
}

/* ---------- bookings with one or several professionals ---------- */
const canDoAll = (st, ids) => !st.service_ids || ids.every((id) => st.service_ids.includes(id));

// Splits the cart among the professionals: one person when someone does everything,
// otherwise as few people as possible, one after another. `missing` = services nobody has.
function splitCart(data, serviceIds) {
  const people = eligibleStaff(data);
  const missing = serviceIds.filter((id) => !people.some((st) => canDoAll(st, [id])));
  let left = serviceIds.filter((id) => !missing.includes(id));
  const groups = [];
  const all = people.filter((st) => canDoAll(st, left));
  if (left.length && all.length) return { groups: [{ service_ids: left, staff: all }], missing };
  while (left.length) {
    let best = [];
    for (const st of people) { const mine = left.filter((id) => canDoAll(st, [id])); if (mine.length > best.length) best = mine; }
    groups.push({ service_ids: best, staff: people.filter((st) => canDoAll(st, best)) });
    left = left.filter((id) => !best.includes(id));
  }
  return { groups, missing };
}

// adds the add-ons (each to the first group it goes with) and how long each group takes
function cartParts(data, groups, addonIds = []) {
  const def = data.settings.default_duration;
  const parts = groups.map((g) => ({ ...g, addon_ids: [] }));
  for (const id of addonIds) parts.find((p) => addonsFor(data, p.service_ids).some((a) => a.id === id))?.addon_ids.push(id);
  for (const p of parts) {
    p.need = p.service_ids.reduce((t, id) => t + (data.services.find((x) => x.id === id)?.duration || def), 0)
      + p.addon_ids.reduce((t, id) => t + ((data.addons || []).find((a) => a.id === id)?.duration || 0), 0);
  }
  return parts;
}

const permutations = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));

// For a start time, an order and a free person for each part so they fit back to back. null if none.
function placeParts(data, parts, key, start, { staffPick } = {}) {
  for (const order of permutations(parts)) {
    let t = start;
    const plan = [];
    for (const p of order) {
      const people = staffPick && parts.length === 1 ? p.staff.filter((st) => st.id === staffPick) : p.staff;
      const st = people.find((x) => isFree(data, x, key, t, t + p.need));
      if (!st) break;
      plan.push({ staff: st.id, services: p.service_ids, addons: p.addon_ids, start: t, end: t + p.need });
      t += p.need;
    }
    if (plan.length === order.length) return plan;
  }
  return null;
}

// start times on a day for the whole cart
function cartStarts(data, parts, key, { staffPick, now = nowInSalon(), notice = data.settings.min_notice } = {}) {
  if (!parts.length || key < now.key) return [];
  const step = data.settings.slot_step || 30;
  const people = [...new Set(parts.flatMap((p) => p.staff))];
  const times = new Set();
  for (const st of people) for (const [o, c] of blocksFor(data, st, key)) for (let m = o; m <= c; m += step) times.add(m);
  return [...times].sort((a, b) => a - b)
    .filter((m) => !(key === now.key && m < now.minute + notice) && placeParts(data, parts, key, m, { staffPick }));
}

// Checks a booking plan like book_group() in schema.sql does, and prices it.
function checkPlan(data, { plan, date, start }, now = nowInSalon()) {
  const s = data.settings;
  if (!plan?.length || plan.length > 4) return { error: "Elegí al menos un servicio." };
  if (date < now.key || date > addDays(now.key, s.booking_days)) return { error: "Ese día no está disponible para reservar." };
  if (date === now.key && start < now.minute + s.min_notice) return { error: "Ese horario ya pasó o está muy cerca. Elegí otro." };
  let t = start, total = 0;
  const segments = [];
  for (const p of plan) {
    const st = data.staff.find((x) => x.id === p.staff && x.active);
    if (!st) return { error: "La agenda cambió. Recargá la página y elegí de nuevo." };
    const services = p.services.map((id) => data.services.find((x) => x.id === id && x.active));
    if (!services.length || services.some((x) => !x) || !canDoAll(st, p.services)) return { error: "Algún servicio ya no está disponible. Recargá la página." };
    const offered = addonsFor(data, p.services);
    const addons = (p.addons || []).map((id) => offered.find((a) => a.id === id));
    if (addons.some((a) => !a)) return { error: "Algún adicional ya no está disponible. Recargá la página." };
    const items = [...services.map((x) => lineOf(x, s.default_duration)), ...addons.map(addonLine)];
    const need = items.reduce((a, x) => a + x.duration, 0);
    if (!isFree(data, st, date, t, t + need)) return { error: "Ese horario se acaba de ocupar. Elegí otro, por favor." };
    const price = items.reduce((a, x) => a + (x.price || 0), 0);
    segments.push({ staff_id: st.id, start_min: t, end_min: t + need, items, total: price });
    total += price; t += need;
  }
  return { segments, total, end: t, deposit: depositFor(s, total) };
}

/* ---------- clients ---------- */
// last visit, next appointment and whether it's time to invite her back
function clientStats(data, client, now = nowInSalon()) {
  const mine = data.appointments.filter((a) => a.kind !== "block" && a.client_id === client.id);
  const once = (list) => new Set(list.map((a) => a.group_id || a.id)).size;
  const done = mine.filter((a) => a.status === "confirmed" && (a.date < now.key || (a.date === now.key && a.end_min <= now.minute)));
  const upcoming = mine.filter((a) => !OFF.includes(a.status) && (a.date > now.key || (a.date === now.key && a.end_min > now.minute)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min);
  const last = done.reduce((m, a) => (!m || a.date > m ? a.date : m), null);
  const since = last ? daysBetween(last, now.key) : null;
  const reminded = client.reminded_at && last && client.reminded_at >= last;
  return {
    visits: once(done), spent: done.reduce((t, a) => t + (a.total || 0), 0),
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
const TABLES = ["categories", "services", "staff", "clients", "appointments", "exceptions", "addons", "gallery", "expenses"];

function publicView(d, today) {
  return {
    settings: d.settings,
    categories: d.categories,
    services: d.services.filter((s) => s.active),
    staff: d.staff.filter((s) => s.active),
    addons: (d.addons || []).filter((a) => a.active),
    gallery: (d.gallery || []).filter((g) => g.active),
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
  async bookGroup(req) {
    const d = this.read();
    const check = checkPlan(d, req);
    if (check.error) throw new Error(check.error);
    const phone = normPhone(req.phone);
    const today = nowInSalon().key;
    const mine = d.appointments.filter((a) => a.client_phone === phone && a.date >= today && !OFF.includes(a.status));
    if (new Set(mine.map((a) => a.group_id || a.id)).size >= 3) throw new Error("Ya tenés varios turnos reservados. Escribile a Mica por WhatsApp.");
    let client = d.clients.find((c) => c.phone === phone);
    if (!client) { client = { id: uid(), name: req.name.trim(), phone, notes: null, reminded_at: null, created_at: new Date().toISOString() }; d.clients.push(client); }
    const status = d.settings.auto_confirm ? "confirmed" : "pending";
    const group = check.segments.length > 1 ? uid() : null;
    const segments = check.segments.map((sg, i) => {
      const appt = {
        id: uid(), kind: "appointment", client_id: client.id, client_name: req.name.trim(), client_phone: phone, date: req.date,
        ...sg, deposit_due: i === 0 ? check.deposit || null : null, deposit: null, reminded_at: null, group_id: group,
        status, notes: req.notes?.trim() || null, source: "web", created_at: new Date().toISOString(),
      };
      d.appointments.push(appt);
      return appt;
    });
    this.write(d);
    return { id: segments[0].id, group_id: group, staff_id: segments[0].staff_id, date: req.date, start_min: req.start, end_min: check.end,
      total: check.total, deposit_due: check.deposit, status, segments };
  },
  async uploadImage(file) {
    const blob = await resizeImage(file, 600);
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
      const [st, categories, services, staff, addons, gallery, exceptions, busy] = await Promise.all([
        sb.from("settings").select("data").eq("id", 1).maybeSingle(),
        sb.from("categories").select("*").order("sort"),
        sb.from("services").select("*").eq("active", true).order("sort"),
        sb.from("staff").select("*").eq("active", true).order("sort"),
        sb.from("addons").select("*").eq("active", true).order("sort"),
        sb.from("gallery").select("*").eq("active", true).order("sort"),
        sb.from("exceptions").select("*").gte("date", today),
        sb.rpc("busy_times", { p_from: today, p_to: addDays(today, 92) }),
      ].map((p) => p.then(must)));
      return { settings: { ...SEED.settings, ...st?.data }, categories, services, staff, addons, gallery, exceptions, busy };
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
    // A plain fetch with keepalive: it is sent immediately and finishes even if the phone jumps to WhatsApp.
    bookGroup(r) {
      return fetch(`${url}/rest/v1/rpc/book_group`, {
        method: "POST", keepalive: true,
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_plan: r.plan.map(({ staff, services, addons }) => ({ staff, services, addons })),
          p_date: r.date, p_start: r.start, p_name: r.name, p_phone: r.phone, p_notes: r.notes || null,
        }),
      }).then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || "No pudimos guardar el turno.");
        return body;
      });
    },
    async uploadImage(file, folder = "services") {
      const blob = await resizeImage(file, folder === "gallery" ? 1400 : 900);
      const path = `${folder}/${uid()}.webp`;
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

// resolves to the adapter in use; DB_NOW is the same adapter once ready, for code that can't wait
const DB = CFG.supabaseUrl && CFG.supabaseAnonKey
  ? loadScript(SUPABASE_JS).then(() => SupabaseDB(CFG.supabaseUrl, CFG.supabaseAnonKey))
  : Promise.resolve(LocalDB);
let DB_NOW = null;
DB.then((db) => { DB_NOW = db; }).catch(() => {});

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
