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

grant select on public.settings, public.categories, public.services, public.staff, public.exceptions to anon, authenticated;
grant all on public.settings, public.categories, public.services, public.staff, public.exceptions,
  public.clients, public.appointments to authenticated;
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
create or replace function public.book(
  p_services text[], p_staff text, p_date date, p_start int,
  p_name text, p_phone text, p_notes text default null
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
  v_staff record; v_blocks jsonb; v_chosen text; v_client uuid; v_id uuid; v_status text;
begin
  if v_phone ~ '^0\d{9}$' then v_phone := '595' || substr(v_phone, 2);
  elsif v_phone ~ '^9\d{8}$' then v_phone := '595' || v_phone; end if;

  if v_name = '' or length(v_name) > 80 then raise exception 'Falta tu nombre.'; end if;
  if length(v_phone) < 8 or length(v_phone) > 15 then raise exception 'Revisá tu número de WhatsApp.'; end if;
  if length(coalesce(p_notes, '')) > 500 then raise exception 'La nota es muy larga.'; end if;
  if coalesce(array_length(p_services, 1), 0) not between 1 and 10 then raise exception 'Elegí al menos un servicio.'; end if;
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
  v_end := p_start + v_duration;

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

  v_status := case when coalesce((s ->> 'auto_confirm')::boolean, true) then 'confirmed' else 'pending' end;
  insert into public.appointments (kind, client_id, client_name, client_phone, staff_id, date, start_min, end_min,
                                   items, total, status, notes, source)
  values ('appointment', v_client, v_name, v_phone, v_chosen, p_date, p_start, v_end,
          v_items, v_total, v_status, nullif(trim(coalesce(p_notes, '')), ''), 'web')
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'staff_id', v_chosen, 'date', p_date, 'start_min', p_start,
                            'end_min', v_end, 'total', v_total, 'status', v_status, 'items', v_items);
end;
$$;

revoke all on function public.busy_times(date, date) from public;
revoke all on function public.book(text[], text, date, int, text, text, text) from public;
grant execute on function public.busy_times(date, date) to anon, authenticated;
grant execute on function public.book(text[], text, date, int, text, text, text) to anon, authenticated;
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
  "auto_confirm": true,
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
  ('lifting', 'pestanas', 'Lifting de pestañas', null, null, 'images/lifting.webp', 'Precio y duración por WhatsApp.', 14),
  ('pelu', 'peluqueria', 'Servicios de peluquería', null, null, 'images/pelu-balayage.webp', 'Contanos qué querés hacerte y te pasamos precio y turno.', 15)
on conflict (id) do nothing;

insert into public.staff (id, name, role, sort) values ('mica', 'Mica', 'Manicurista', 0)
on conflict (id) do nothing;

-- ============ last step: give Mica access ============
-- 1. Supabase → Authentication → Users → Add user → her email and a password.
-- 2. Run this line with her email:
--    insert into public.admins (user_id) select id from auth.users where email = 'SU-EMAIL@ejemplo.com';
