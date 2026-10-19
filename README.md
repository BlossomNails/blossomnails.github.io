# Blossom Beauty Salon website

Static site (HTML/CSS/JS, no build step) with a booking system and an owner panel. Data lives in Supabase; without Supabase keys it runs in **modo demo**, storing everything in the browser.

- `index.html`: public page for the Instagram link in bio. Two views: **reservas** (services, real free times, booking) and **salón** (`#salon`: about, gallery, gift cards, FAQ, map). Clients pick services, a professional (only asked when there's more than one), a day and a free time, then leave their name and WhatsApp. The booking goes straight into the agenda; a WhatsApp message to Mica is optional.
- `admin.html`: Mica's panel, behind a login. Inicio (today, income, upcoming, pending, clients due to come back), Agenda (list and day view, block time), Nueva cita (any service, with editable price and duration), Servicios and categories, Clientas (history, notes, 21-day reminder by WhatsApp), Horarios, Días especiales (holidays, different hours), Profesionales, Control financiero and Ajustes.
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
