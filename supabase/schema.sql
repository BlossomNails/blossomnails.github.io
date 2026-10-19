-- Blossom Beauty Salon · database for Supabase
-- Paste this whole file in Supabase → SQL Editor → New query → Run.
-- It can be run again safely: it never overwrites Mica's data, only adds what's missing.

-- ============ tables ============
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'
);

create table if not exists public.categories (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  image text,
  sort int not null default 0
);

create table if not exists public.services (
  id text primary key default gen_random_uuid()::text,
  category_id text references public.categories (id) on update cascade on delete set null,
  name text not null,
  description text,
  price int check (price >= 0),          -- guaraníes; null = "Consultar"
  duration int check (duration > 0),    -- minutes; null = a confirmar
  image text,
  active boolean not null default true,  -- false = hidden from the booking page
  sort int not null default 0
);

create table if not exists public.staff (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  role text,
  active boolean not null default true,
  sort int not null default 0,
  hours jsonb,        -- null = the salon's hours; else 7 lists of [open, close] minutes, index 0 = domingo
  service_ids text[]  -- null = every service
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text unique,  -- digits only, e.g. 595981123456
  notes text,
  reminded_at date,   -- last time Mica sent the "time to come back" message
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'appointment' check (kind in ('appointment', 'block')),
  client_id uuid references public.clients (id) on delete set null,
  client_name text,
  client_phone text,
  staff_id text references public.staff (id) on delete set null,
  date date not null,                    -- salon time (America/Asuncion)
  start_min int not null check (start_min between 0 and 1439),
  end_min int not null check (end_min > start_min and end_min <= 1440),
  items jsonb not null default '[]',     -- [{service_id, name, price, duration}]
  total int not null default 0,
  status text not null default 'confirmed' check (status in ('confirmed', 'pending', 'cancelled', 'no_show')),
  notes text,
  source text not null default 'panel' check (source in ('web', 'panel')),
  created_at timestamptz not null default now()
);
create index if not exists appointments_date_idx on public.appointments (date);
create index if not exists appointments_client_idx on public.appointments (client_id);
alter table public.appointments add column if not exists deposit_due int;         -- seña asked for (guaraníes)
alter table public.appointments add column if not exists deposit int;             -- seña received; null = not yet
alter table public.appointments add column if not exists reminded_at timestamptz; -- "tu turno es mañana" sent
alter table public.clients add column if not exists review_requested_at date;     -- Google review asked

-- extras the client can add to a service (francesitas, largor 3, ...)
create table if not exists public.addons (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  price int not null default 0 check (price >= 0),
  duration int not null default 0 check (duration >= 0),
  category_ids text[],  -- null = offered with every service
  active boolean not null default true,
  sort int not null default 0
);

-- photos of her work on the salon page
create table if not exists public.gallery (
  id text primary key default gen_random_uuid()::text,
  image text not null,
  caption text,
  active boolean not null default true,
  sort int not null default 0
);

-- special days: closed, or different hours (blocks = [] means closed)
create table if not exists public.exceptions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  staff_id text references public.staff (id) on delete cascade,  -- null = the whole salon
  blocks jsonb not null default '[]',
  note text
);
create index if not exists exceptions_date_idx on public.exceptions (date);

-- who can open the panel
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- ============ security ============
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

alter table public.settings enable row level security;
alter table public.categories enable row level security;
alter table public.services enable row level security;
alter table public.staff enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.exceptions enable row level security;
alter table public.admins enable row level security;
alter table public.addons enable row level security;
alter table public.gallery enable row level security;

-- the booking page can read the catalogue, hours and special days; only Mica can change them
drop policy if exists "read settings" on public.settings;
create policy "read settings" on public.settings for select using (true);
drop policy if exists "admin settings" on public.settings;
create policy "admin settings" on public.settings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read categories" on public.categories;
create policy "read categories" on public.categories for select using (true);
drop policy if exists "admin categories" on public.categories;
create policy "admin categories" on public.categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read services" on public.services;
create policy "read services" on public.services for select using (active or public.is_admin());
drop policy if exists "admin services" on public.services;
create policy "admin services" on public.services for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read staff" on public.staff;
create policy "read staff" on public.staff for select using (active or public.is_admin());
drop policy if exists "admin staff" on public.staff;
create policy "admin staff" on public.staff for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read addons" on public.addons;
create policy "read addons" on public.addons for select using (active or public.is_admin());
drop policy if exists "admin addons" on public.addons;
create policy "admin addons" on public.addons for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read gallery" on public.gallery;
create policy "read gallery" on public.gallery for select using (active or public.is_admin());
drop policy if exists "admin gallery" on public.gallery;
create policy "admin gallery" on public.gallery for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read exceptions" on public.exceptions;
create policy "read exceptions" on public.exceptions for select using (true);
drop policy if exists "admin exceptions" on public.exceptions;
create policy "admin exceptions" on public.exceptions for all using (public.is_admin()) with check (public.is_admin());

-- clients and appointments are private: only Mica. Visitors book through book() below.
drop policy if exists "admin clients" on public.clients;
create policy "admin clients" on public.clients for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin appointments" on public.appointments;
create policy "admin appointments" on public.appointments for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "own admin row" on public.admins;
create policy "own admin row" on public.admins for select using (user_id = auth.uid());

grant select on public.settings, public.categories, public.services, public.staff, public.exceptions,
  public.addons, public.gallery to anon, authenticated;
grant all on public.settings, public.categories, public.services, public.staff, public.exceptions,
  public.clients, public.appointments, public.addons, public.gallery to authenticated;
grant select on public.admins to authenticated;

-- ============ booking page functions ============
-- taken times, without any client details, only as far ahead as clients can book
create or replace function public.busy_times(p_from date, p_to date)
returns table (staff_id text, date date, start_min int, end_min int)
language sql stable security definer set search_path = public as $$
  select a.staff_id, a.date, a.start_min, a.end_min
  from public.appointments a
  where a.date between p_from and least(p_to, p_from + coalesce(
      (select (st.data ->> 'booking_days')::int from public.settings st where st.id = 1), 14))
    and a.status not in ('cancelled', 'no_show');
$$;

-- A web booking. Prices and durations come from the catalogue, never from the visitor,
-- and the time is checked again here so two people can't take the same slot.
-- Mirrors planBooking() in core.js.
drop function if exists public.book(text[], text, date, int, text, text, text);
create or replace function public.book(
  p_services text[], p_staff text, p_date date, p_start int,
  p_name text, p_phone text, p_notes text default null, p_addons text[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s jsonb := coalesce((select data from public.settings where id = 1), '{}');
  v_now timestamp := now() at time zone 'America/Asuncion';
  v_today date := v_now::date;
  v_minute int := extract(hour from v_now)::int * 60 + extract(minute from v_now)::int;
  v_default int := coalesce((s ->> 'default_duration')::int, 60);
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name text := trim(coalesce(p_name, ''));
  v_items jsonb; v_total int; v_duration int; v_found int; v_end int;
  v_cats text[]; v_extra jsonb; v_extra_total int; v_extra_min int; v_deposit int := 0;
  v_staff record; v_blocks jsonb; v_chosen text; v_client uuid; v_id uuid; v_status text;
begin
  if v_phone ~ '^0\d{9}$' then v_phone := '595' || substr(v_phone, 2);
  elsif v_phone ~ '^9\d{8}$' then v_phone := '595' || v_phone; end if;

  if v_name = '' or length(v_name) > 80 then raise exception 'Falta tu nombre.'; end if;
  if length(v_phone) < 8 or length(v_phone) > 15 then raise exception 'Revisá tu número de WhatsApp.'; end if;
  if length(coalesce(p_notes, '')) > 500 then raise exception 'La nota es muy larga.'; end if;
  if coalesce(array_length(p_services, 1), 0) not between 1 and 10 then raise exception 'Elegí al menos un servicio.'; end if;
  if coalesce(array_length(p_addons, 1), 0) > 10 then raise exception 'Son demasiados adicionales.'; end if;
  if p_start is null or p_start not between 0 and 1439 then raise exception 'Elegí un horario.'; end if;

  select jsonb_agg(jsonb_build_object('service_id', sv.id, 'name', sv.name, 'price', sv.price,
           'duration', coalesce(sv.duration, v_default)) order by u.ord),
         coalesce(sum(coalesce(sv.price, 0)), 0), coalesce(sum(coalesce(sv.duration, v_default)), 0), count(*)
    into v_items, v_total, v_duration, v_found
  from unnest(p_services) with ordinality as u(id, ord)
  join public.services sv on sv.id = u.id and sv.active;
  if v_found <> array_length(p_services, 1) then
    raise exception 'Algún servicio ya no está disponible. Recargá la página.';
  end if;

  -- add-ons, only those offered with the chosen services
  if coalesce(array_length(p_addons, 1), 0) > 0 then
    select array_agg(distinct sv.category_id) into v_cats from public.services sv where sv.id = any(p_services);
    select coalesce(jsonb_agg(jsonb_build_object('addon_id', ad.id, 'name', ad.name, 'price', ad.price,
             'duration', ad.duration) order by u.ord), '[]'),
           coalesce(sum(ad.price), 0), coalesce(sum(ad.duration), 0), count(*)
      into v_extra, v_extra_total, v_extra_min, v_found
    from unnest(p_addons) with ordinality as u(id, ord)
    join public.addons ad on ad.id = u.id and ad.active and (ad.category_ids is null or ad.category_ids && v_cats);
    if v_found <> array_length(p_addons, 1) then
      raise exception 'Algún adicional ya no está disponible. Recargá la página.';
    end if;
    v_items := v_items || v_extra;
    v_total := v_total + v_extra_total;
    v_duration := v_duration + v_extra_min;
  end if;
  v_end := p_start + v_duration;

  -- seña: a fixed amount (never more than the total) or a percentage rounded to thousands
  if coalesce((s ->> 'deposit_enabled')::boolean, false) and coalesce((s ->> 'deposit_value')::int, 0) > 0 then
    if s ->> 'deposit_type' = 'percent' then
      v_deposit := (round(v_total * (s ->> 'deposit_value')::numeric / 100000) * 1000)::int;
    elsif v_total > 0 then
      v_deposit := least((s ->> 'deposit_value')::int, v_total);
    else
      v_deposit := (s ->> 'deposit_value')::int;
    end if;
  end if;

  if p_date < v_today or p_date > v_today + coalesce((s ->> 'booking_days')::int, 14) then
    raise exception 'Ese día no está disponible para reservar.';
  end if;
  if p_date = v_today and p_start < v_minute + coalesce((s ->> 'min_notice')::int, 60) then
    raise exception 'Ese horario ya pasó o está muy cerca. Elegí otro.';
  end if;
  if (select count(*) from public.appointments a where a.client_phone = v_phone and a.date >= v_today
        and a.status not in ('cancelled', 'no_show')) >= 3 then
    raise exception 'Ya tenés varios turnos reservados. Escribile a Mica por WhatsApp.';
  end if;

  for v_staff in
    select * from public.staff st
    where st.active and (p_staff is null or st.id = p_staff)
      and (st.service_ids is null or p_services <@ st.service_ids)
    order by st.sort, st.name
  loop
    -- opening blocks: this person's special day > the salon's special day > weekly hours
    select e.blocks into v_blocks from public.exceptions e where e.date = p_date and e.staff_id = v_staff.id limit 1;
    if v_blocks is null then
      select e.blocks into v_blocks from public.exceptions e where e.date = p_date and e.staff_id is null limit 1;
    end if;
    if v_blocks is null then
      v_blocks := coalesce(v_staff.hours, s -> 'hours') -> extract(dow from p_date)::int;
    end if;

    if exists (select 1 from jsonb_array_elements(coalesce(v_blocks, '[]')) b
               where (b ->> 0)::int <= p_start and v_end <= (b ->> 1)::int) then
      perform pg_advisory_xact_lock(hashtext(v_staff.id || p_date::text));
      if not exists (select 1 from public.appointments a
                     where a.staff_id = v_staff.id and a.date = p_date
                       and a.status not in ('cancelled', 'no_show')
                       and a.start_min < v_end and a.end_min > p_start) then
        v_chosen := v_staff.id;
        exit;
      end if;
    end if;
    v_blocks := null;
  end loop;

  if v_chosen is null then raise exception 'Ese horario se acaba de ocupar. Elegí otro, por favor.'; end if;

  -- an existing client keeps the name Mica saved
  insert into public.clients (name, phone) values (v_name, v_phone)
  on conflict (phone) do update set phone = excluded.phone
  returning id into v_client;

  v_status := case when coalesce((s ->> 'auto_confirm')::boolean, false) then 'confirmed' else 'pending' end;
  insert into public.appointments (kind, client_id, client_name, client_phone, staff_id, date, start_min, end_min,
                                   items, total, deposit_due, status, notes, source)
  values ('appointment', v_client, v_name, v_phone, v_chosen, p_date, p_start, v_end,
          v_items, v_total, nullif(v_deposit, 0), v_status, nullif(trim(coalesce(p_notes, '')), ''), 'web')
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'staff_id', v_chosen, 'date', p_date, 'start_min', p_start,
                            'end_min', v_end, 'total', v_total, 'deposit_due', v_deposit,
                            'status', v_status, 'items', v_items);
end;
$$;

revoke all on function public.busy_times(date, date) from public;
revoke all on function public.book(text[], text, date, int, text, text, text, text[]) from public;
grant execute on function public.busy_times(date, date) to anon, authenticated;
grant execute on function public.book(text[], text, date, int, text, text, text, text[]) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ============ photos (Storage bucket "media") ============
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
    drop policy if exists "admin upload media" on storage.objects;
    create policy "admin upload media" on storage.objects for insert to authenticated
      with check (bucket_id = 'media' and public.is_admin());
    drop policy if exists "admin change media" on storage.objects;
    create policy "admin change media" on storage.objects for update to authenticated
      using (bucket_id = 'media' and public.is_admin());
    drop policy if exists "admin delete media" on storage.objects;
    create policy "admin delete media" on storage.objects for delete to authenticated
      using (bucket_id = 'media' and public.is_admin());
  end if;
end $$;

-- ============ starting data (same as SEED in core.js; skipped if already there) ============
insert into public.settings (id, data) values (1, '{
  "business_name": "Blossom Beauty Salon",
  "owner_name": "Micaela",
  "whatsapp": "595981676610",
  "instagram": "https://www.instagram.com/blossomnails.py/",
  "address": "Paz del Chaco c/ Boquerón",
  "city": "Fernando de la Mora, zona sur",
  "hours": [[], [[480,720],[840,1140]], [[480,720],[840,1140]], [[480,720],[840,1140]], [[480,720],[840,1140]], [[480,720],[840,1140]], [[480,720],[840,1140]]],
  "booking_days": 14,
  "slot_step": 30,
  "min_notice": 60,
  "default_duration": 60,
  "auto_confirm": false,
  "deposit_enabled": false,
  "deposit_type": "fixed",
  "deposit_value": 0,
  "payment_info": "",
  "review_url": "",
  "review_text": "¡Gracias por venir, {nombre}! 🌸 Si te gustó cómo quedó, ¿me dejarías una reseña en Google? Me ayuda muchísimo: {link}",
  "appt_reminder_text": "¡Hola {nombre}! 🌸 Te recuerdo tu turno de mañana, {dia} a las {hora}, en Blossom ({servicios}). ¡Te espero!",
  "reminder_days": 21,
  "reminder_text": "¡Hola {nombre}! 🌸 Ya pasaron {dias} días desde tu último turno en Blossom. ¿Reservamos tu retoque? Elegí día y horario acá: {link}"
}') on conflict (id) do nothing;

insert into public.categories (id, name, image, sort) values
  ('manos', 'Manos', 'images/kapping.webp', 0),
  ('esculpidas', 'Extensiones', 'images/esculpidas-semi.webp', 1),
  ('pies', 'Pies', 'images/pedicura-tradicional.webp', 2),
  ('pestanas', 'Pestañas', 'images/ext-clasicas.webp', 3),
  ('peluqueria', 'Peluquería', 'images/peluqueria.webp', 4)
on conflict (id) do nothing;

insert into public.services (id, category_id, name, price, duration, image, description, sort) values
  ('mani-trad', 'manos', 'Manicura tradicional', 35000, 30, 'images/manicura-tradicional.webp', null, 0),
  ('mani-semi', 'manos', 'Manicura semipermanente', 70000, 50, null, 'Sobre el largor de tus uñas naturales. Retoque cada 21 días.', 1),
  ('rubber', 'manos', 'Base rubber + semipermanente', 110000, 60, null, null, 2),
  ('kapping', 'manos', 'Kapping + semipermanente', 130000, 105, 'images/kapping.webp', 'Refuerzo sobre tu uña natural, sin agregar largo. Gel, acrílico o polygel. Diseños: cotizá por WhatsApp. Retoque cada 21 días.', 3),
  ('extraccion', 'manos', 'Extracción', 60000, 45, 'images/extraccion.webp', 'Acrílico, polygel o gel. Incluye manicura tradicional.', 4),
  ('esc-nude', 'esculpidas', 'Esculpidas acrílicas nude', 130000, 60, 'images/esculpidas-nude.webp', 'Hasta largor 2. Retoque cada 21 días.', 5),
  ('softgel', 'esculpidas', 'Softgel', 130000, 90, 'images/softgel.webp', 'Incluye semipermanente. Diseños: cotizá por WhatsApp. Retoque cada 21 días.', 6),
  ('esc-semi', 'esculpidas', 'Esculpidas + semipermanente', 160000, 105, 'images/esculpidas-semi.webp', 'Acrílico o polygel, hasta largor 2. Diseños: cotizá por WhatsApp. Retoque cada 21 días.', 7),
  ('pedi-trad', 'pies', 'Pedicura tradicional', 50000, 45, 'images/pedicura-tradicional.webp', null, 8),
  ('pedi-semi', 'pies', 'Pedicura semipermanente', 80000, 50, null, 'Color de larga duración y brillo impecable por 1 mes.', 9),
  ('spa-pies', 'pies', 'Spa de pies premium 👑', 140000, 90, 'images/spa-pies.webp', 'Pedicura profunda con hidromasaje, aromaterapia, reflexología y parafina. Incluye semipermanente.', 10),
  ('ext-clasicas', 'pestanas', 'Extensiones clásicas', 160000, 180, 'images/ext-clasicas.webp', null, 11),
  ('ext-griego', 'pestanas', 'Extensiones volumen griego', 180000, 180, 'images/ext-griego.webp', 'Efecto tupido.', 12),
  ('ext-brasilero', 'pestanas', 'Extensiones volumen brasilero', 180000, 180, 'images/ext-brasilero.webp', 'Efecto semitupido.', 13),
  ('lifting', 'pestanas', 'Lifting de pestañas', 110000, 120, 'images/lifting.webp', 'Realza la mirada de forma natural. Dura 30 días.', 14),
  ('pelu', 'peluqueria', 'Servicios de peluquería', null, null, 'images/pelu-balayage.webp', 'Contanos qué querés hacerte y te pasamos precio y turno.', 15)
on conflict (id) do nothing;

insert into public.staff (id, name, role, sort) values ('mica', 'Mica', 'Manicurista', 0)
on conflict (id) do nothing;

-- full catalogue from Mica's PDF catalogues (2026-10), add-ons and the gallery
insert into public.categories (id, name, image, sort) values
  ('cejas', 'Cejas', null, 4),
  ('maquillaje', 'Maquillaje', null, 6)
on conflict (id) do nothing;

insert into public.services (id, category_id, name, price, duration, image, description, sort) values
  ('kapping-nude', 'manos', 'Kapping nude', 100000, 105, null, 'Refuerzo sobre tu uña natural, sin agregar largo. Gel, acrílico o polygel. Retoque cada 21 días.', 101),
  ('rubber-nude', 'manos', 'Base rubber nude', 80000, 60, null, 'Fortalece uñas naturales finas o quebradizas, sin agregar largo.', 102),
  ('service-kapping-nude', 'manos', 'Service kapping nude', 100000, null, null, 'Mantenimiento de tu kapping.', 103),
  ('service-kapping-semi', 'manos', 'Service kapping + semipermanente', 110000, null, null, 'Mantenimiento de tu kapping con semipermanente.', 104),
  ('service-esc-nude', 'esculpidas', 'Service esculpidas nude', 100000, null, null, 'Mantenimiento de tus esculpidas.', 111),
  ('service-esc-semi', 'esculpidas', 'Service esculpidas + semipermanente', 130000, null, null, 'Mantenimiento de tus esculpidas con semipermanente.', 112),
  ('service-softgel', 'esculpidas', 'Service softgel', 110000, null, null, 'Mantenimiento de tu softgel.', 113),
  ('ext-hawaiano', 'pestanas', 'Extensiones volumen hawaiano', 180000, 180, null, null, 121),
  ('ext-foxy', 'pestanas', 'Extensiones foxy eyes', 200000, 180, null, null, 122),
  ('ext-anime', 'pestanas', 'Extensiones efecto anime', 200000, 180, null, null, 123),
  ('mant-clasicas', 'pestanas', 'Mantenimiento clásicas', 140000, null, null, 'Cada 15 a 29 días. Después de 30 días se cobra como colocación nueva.', 124),
  ('mant-volumen', 'pestanas', 'Mantenimiento volumen (brasilero, hawaiano o griego)', 160000, null, null, 'Cada 15 a 29 días. Después de 30 días se cobra como colocación nueva.', 125),
  ('mant-foxy-anime', 'pestanas', 'Mantenimiento foxy eyes o efecto anime', 180000, null, null, 'Cada 15 a 29 días. Después de 30 días se cobra como colocación nueva.', 126),
  ('laminacion-cejas', 'cejas', 'Laminación de cejas', 130000, 120, null, 'Para una mirada más marcada. Incluye tinte. Dura 30 días.', 131),
  ('cejas-hilo', 'cejas', 'Diseño de cejas + depilación con hilo', 40000, null, null, null, 132),
  ('cejas-hilo-henna', 'cejas', 'Diseño de cejas + depilación con hilo + henna', 70000, null, null, null, 133),
  ('cejas-perfilado-henna', 'cejas', 'Diseño de cejas + perfilado + henna', 50000, null, null, null, 134),
  ('cejas-cera', 'cejas', 'Depilación con cera: cejas, bozo y mentón', 50000, null, null, 'Incluye el diseño de cejas.', 135),
  ('cejas-marcacion', 'cejas', 'Diseño de cejas + perfilado + marcación', 25000, null, null, null, 136),
  ('pelu-bano', 'peluqueria', 'Baño capilar', 20000, null, null, null, 141),
  ('pelu-bano-alfaparf', 'peluqueria', 'Baño Alfaparf Semi di Lino', 50000, null, null, null, 142),
  ('pelu-bano-mascarilla', 'peluqueria', 'Baño Alfaparf + mascarilla', 70000, null, null, null, 143),
  ('pelu-secado', 'peluqueria', 'Secado', 15000, null, null, null, 144),
  ('pelu-secado-difusor', 'peluqueria', 'Secado con difusor', 20000, null, null, null, 145),
  ('pelu-brushing', 'peluqueria', 'Brushing', 40000, null, null, 'Precio desde Gs. 40.000, según el largo.', 146),
  ('pelu-brushing-mov', 'peluqueria', 'Brushing con movimiento', 50000, null, null, null, 147),
  ('pelu-brushing-plancha', 'peluqueria', 'Brushing + planchita', 60000, null, null, null, 148),
  ('pelu-ondas', 'peluqueria', 'Ondas', 70000, null, 'images/pelu-ondas.webp', null, 149),
  ('pelu-corte', 'peluqueria', 'Corte', 30000, null, 'images/pelu-corte.webp', 'Precio desde Gs. 30.000.', 150),
  ('pelu-semi-recogido', 'peluqueria', 'Peinado semi recogido', 80000, null, null, null, 151),
  ('pelu-recogido', 'peluqueria', 'Peinado recogido', 100000, null, null, null, 152),
  ('pelu-peinado-ninas', 'peluqueria', 'Peinado para niñas', 30000, null, null, 'Precio desde Gs. 30.000.', 153),
  ('pelu-colageno', 'peluqueria', 'Colágeno', 90000, null, null, 'Para cabello seco y deshidratado: hidrata y da suavidad y brillo. Incluye brushing y acabado profesional.', 154),
  ('pelu-keratina', 'peluqueria', 'Keratina', 120000, null, null, 'Para cabello con frizz, poroso o difícil de manejar. Incluye brushing y acabado profesional.', 155),
  ('pelu-botox', 'peluqueria', 'Botox capilar', 120000, null, null, 'Para cabello dañado, débil o con frizz. Incluye brushing y acabado profesional.', 156),
  ('pelu-alisado-organico', 'peluqueria', 'Alisado orgánico', 250000, null, null, 'Incluye brushing y acabado profesional.', 157),
  ('pelu-alisado-progresivo', 'peluqueria', 'Alisado progresivo', 200000, null, null, 'Incluye brushing y acabado profesional.', 158),
  ('pelu-raiz', 'peluqueria', 'Retoque de raíz', 170000, null, null, 'Incluye brushing y acabado profesional.', 159),
  ('pelu-matizacion', 'peluqueria', 'Matización', 130000, null, null, 'Incluye brushing y acabado profesional.', 160),
  ('pelu-balayage', 'peluqueria', 'Balayage', 450000, null, 'images/pelu-balayage.webp', 'Incluye brushing y acabado profesional.', 161),
  ('pelu-morena', 'peluqueria', 'Morena iluminada', 300000, null, null, 'Incluye brushing y acabado profesional.', 162),
  ('pelu-mechas', 'peluqueria', 'Mechas tradicionales', 350000, null, null, 'Incluye brushing y acabado profesional.', 163),
  ('pelu-combo-brushing', 'peluqueria', 'Combo: lavado + brushing + planchita', 80000, null, null, 'Válido de lunes a jueves.', 164),
  ('pelu-combo-alfaparf', 'peluqueria', 'Combo: tratamiento Alfaparf + corte + secado', 100000, null, null, 'Válido de lunes a jueves.', 165),
  ('makeup-express', 'maquillaje', 'Makeup express', 130000, null, null, 'Limpieza facial exprés, base sin correcciones y ojos en tonos suaves. Pestañas postizas de regalo.', 171),
  ('makeup-social', 'maquillaje', 'Social makeup', 230000, null, null, 'Preparación de piel, base de alta cobertura, contorno, ojos definidos y fijación. Pestañas postizas de regalo.', 172)
on conflict (id) do nothing;

insert into public.addons (id, name, price, duration, category_ids, sort) values
  ('largor-3', 'Largor 3 o 4', 10000, 0, '{esculpidas}', 1),
  ('largor-5', 'Largor 5 o más', 20000, 0, '{esculpidas}', 2),
  ('francesitas', 'Francesitas', 20000, 0, '{manos,esculpidas}', 3),
  ('ojo-gato', 'Ojo de gato', 20000, 0, '{manos,esculpidas}', 4),
  ('reconstruccion', 'Reconstrucción de una uña', 10000, 0, '{manos,esculpidas}', 5),
  ('extraccion-semi', 'Extracción de semipermanente (incluye manicura)', 30000, 0, '{manos,esculpidas}', 6),
  ('extraccion-acrilico', 'Extracción de acrílico, polygel, softgel o kapping (incluye manicura)', 50000, 0, '{manos,esculpidas}', 7)
on conflict (id) do nothing;

insert into public.gallery (id, image, caption, sort) values
  ('g01', 'images/esculpidas-semi.webp', 'Extensiones con diseño de flores', 0),
  ('g02', 'images/unas-hello-kitty.webp', 'Francesitas con diseño de Hello Kitty', 1),
  ('g03', 'images/ext-griego.webp', 'Extensiones volumen griego', 2),
  ('g04', 'images/unas-celeste-rosa.webp', 'Diseño en celeste y rosa', 3),
  ('g05', 'images/peluqueria.webp', 'Ondas', 4),
  ('g06', 'images/softgel.webp', 'Softgel con diseño de flor', 5),
  ('g07', 'images/unas-estrellas.webp', 'Diseño de estrellas', 6),
  ('g08', 'images/lifting.webp', 'Lifting de pestañas', 7),
  ('g09', 'images/unas-bordo.webp', 'Diseño en bordó', 8),
  ('g10', 'images/pelu-balayage.webp', 'Color con ondas', 9),
  ('g11', 'images/esculpidas-nude.webp', 'Extensiones nude', 10),
  ('g12', 'images/unas-corazones.webp', 'Diseño de corazones', 11),
  ('g13', 'images/ext-brasilero.webp', 'Extensiones volumen brasilero', 12),
  ('g14', 'images/unas-strass.webp', 'Rosa con strass', 13),
  ('g15', 'images/pelu-ondas.webp', 'Rubio con ondas', 14),
  ('g16', 'images/kapping.webp', 'Kapping con francesitas', 15),
  ('g17', 'images/unas-hojas.webp', 'Diseño de hojas', 16),
  ('g18', 'images/unas-blanco-negro.webp', 'Diseño en blanco y negro', 17),
  ('g19', 'images/ext-clasicas.webp', 'Extensiones clásicas', 18),
  ('g20', 'images/pelu-corte.webp', 'Corte en capas', 19),
  ('g21', 'images/unas-disney.webp', 'Diseño de Disney', 20),
  ('g22', 'images/unas-carey.webp', 'Carey y estrellas', 21),
  ('g23', 'images/extraccion.webp', 'Extensiones', 22),
  ('g24', 'images/spa-pies.webp', 'Spa de pies', 23),
  ('g25', 'images/pedicura-tradicional.webp', 'Pedicura tradicional', 24)
on conflict (id) do nothing;

-- ============ last step: give Mica access ============
-- 1. Supabase → Authentication → Users → Add user → her email and a password.
-- 2. Run this line with her email:
--    insert into public.admins (user_id) select id from auth.users where email = 'SU-EMAIL@ejemplo.com';
