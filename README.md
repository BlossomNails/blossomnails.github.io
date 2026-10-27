# Blossom Beauty Salon website

Static site (HTML/CSS/JS, no build step) with a booking system and an owner panel. Data lives in Supabase; without Supabase keys it runs in **modo demo**, storing everything in the browser.

- `index.html`: public page for the Instagram link in bio. Two views: **reservas** (services, real free times, booking) and **salón** (`#salon`: about, gallery, gift cards, FAQ, map). Clients pick services, a professional (only asked when there's more than one), a day and a free time, then leave their name and WhatsApp. One tap saves the turn in Mica's agenda as "por confirmar" and opens WhatsApp with the booking message ("¿Tenés disponible?"); Mica confirms or edits it from the panel. Auto-confirm can be switched on in Horarios. Clients can add extras (francesitas, largor, ojo de gato…) and, when Mica turns it on, see the seña with her transfer details. The salon's rules (puntualidad, cancelación) show before sending, and once her Google review link is set, review buttons appear on both views (plus a "¿Cómo te quedó?" card for visitors who came in the last two weeks).
- `admin.html`: Mica's panel, behind a login. Inicio (today, income, pending, tomorrow's reminders, birthdays of the coming week, review requests, clients due to come back), Agenda (list and day view, block time), Nueva cita (any service or extra, with editable price and duration), Servicios, categories and adicionales, Clientas (history, notes, birthday, 21-day reminder, Google review request by WhatsApp), Galería (upload and order the photos on the salon page), Horarios, Días especiales (holidays, different hours), Profesionales, Control financiero (income with señas, expenses and the real profit) and Ajustes (seña amount and transfer details, message templates, birthday gift, salon rules, Google review link and a printable QR for it).
- `core.js`: shared data layer. The starting catalogue (`SEED`), the availability rules, and the two storage adapters (Supabase and modo demo).
- `app.js` / `admin.js`: behaviour for each page. `styles.css` is shared; `admin.css` adds the panel.
- `config.js`: Supabase URL and anon key. Empty = modo demo.
- `supabase/schema.sql`: tables, row-level security, the `book()` function that validates web bookings, and the starting data. Setup steps (in Spanish) are in `SUPABASE.md`.
- `context/`: earlier notes and a backup of the site before the panel was added.

Prices, services, hours and staff are edited from the panel, not in code. `SEED` in `core.js` and the inserts at the end of `schema.sql` are only the starting point.

Preview locally: `python3 -m http.server 8765`, then open http://localhost:8765 and http://localhost:8765/admin.html (in modo demo any email and password work).

## Still to do with Mica
- [ ] Create the Supabase project and her user (see `SUPABASE.md`), then publish.
- [ ] Prices and durations for lifting de pestañas and peluquería. The PDF catalogues she sent have full price lists for nails, lashes and hair; she can load them from the panel.
- [ ] Confirm the map pin. It currently points at the Paz del Chaco & Boquerón intersection.
- [ ] After hosting, change `og:image` to the full URL so WhatsApp and Instagram show the preview image.
