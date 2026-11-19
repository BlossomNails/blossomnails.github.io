-- Blossom Beauty Salon: portal de gestión para una profesional autorizada (Lore).
-- Migración aditiva: no modifica ni elimina datos existentes.
-- Aplicar en Supabase SQL Editor después de revisar el entorno de producción.

create table if not exists public.staff_private (
  id text primary key references public.staff(id) on delete cascade,
  code text unique,
  commission numeric(5,2),
  portal_role text not null default 'viewer' check (portal_role in ('viewer','manager'))
);

alter table public.staff_private add column if not exists portal_role text not null default 'viewer';
alter table public.staff_private drop constraint if exists staff_private_portal_role_check;
alter table public.staff_private add constraint staff_private_portal_role_check check (portal_role in ('viewer','manager'));
alter table public.staff_private enable row level security;
revoke all on public.staff_private from anon, authenticated;
drop policy if exists "admin staff private" on public.staff_private;
create policy "admin staff private" on public.staff_private
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant all on public.staff_private to authenticated;

alter table public.appointments add column if not exists final_total int;
alter table public.appointments add column if not exists paid_amount int not null default 0;
alter table public.appointments add column if not exists completed_at timestamptz;
alter table public.appointments add column if not exists created_by_staff text references public.staff(id) on delete set null;
alter table public.appointments add column if not exists updated_by_staff text references public.staff(id) on delete set null;

-- Migrate existing deposits into the cumulative amount already received.
update public.appointments
set paid_amount = greatest(coalesce(paid_amount, 0), coalesce(deposit, 0));

create or replace function public.staff_portal_data(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_staff public.staff;
  v_private public.staff_private;
  v_today date := (now() at time zone 'America/Asuncion')::date;
begin
  select sp.* into v_private
  from public.staff_private sp
  where sp.code = upper(regexp_replace(coalesce(p_code,''), '[^A-Z0-9]', '', 'g'));
  if not found then raise exception 'Ese código no funciona. Pedile a Mica tu link de nuevo.'; end if;

  select st.* into v_staff from public.staff st
  where st.id = v_private.id and st.active;
  if not found then raise exception 'Ese acceso ya no está activo. Hablá con Mica.'; end if;

  return jsonb_build_object(
    'staff', jsonb_build_object('id',v_staff.id,'name',v_staff.name,'role',v_staff.role,
      'active',v_staff.active,'hours',v_staff.hours,'commission',v_private.commission,
      'portal_role',v_private.portal_role),
    'settings', coalesce((select data from public.settings where id=1),'{}'::jsonb),
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort) from public.services s where s.active),'[]'::jsonb),
    'exceptions', coalesce((select jsonb_agg(to_jsonb(e)) from public.exceptions e
      where e.date between v_today - 90 and v_today + 92 and (e.staff_id is null or e.staff_id=v_staff.id)),'[]'::jsonb),
    'appointments', coalesce((select jsonb_agg(
      jsonb_build_object('id',a.id,'kind',a.kind,'staff_id',a.staff_id,'client_id',a.client_id,
        'client_name',a.client_name,'client_phone',a.client_phone,'date',a.date,
        'start_min',a.start_min,'end_min',a.end_min,'items',a.items,'total',a.total,
        'final_total',coalesce(a.final_total,a.total),'paid_amount',a.paid_amount,
        'deposit',a.deposit,'deposit_due',a.deposit_due,'status',a.status,'notes',a.notes,
        'source',a.source,'created_by_staff',a.created_by_staff,'completed_at',a.completed_at)
      order by a.date,a.start_min)
      from public.appointments a where a.staff_id=v_staff.id
        and a.date between v_today - 90 and v_today + 92),'[]'::jsonb),
    'clients', case when v_private.portal_role='manager' then
      coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'phone',c.phone,'notes',c.notes,'created_at',c.created_at))
        from public.clients c where exists(select 1 from public.appointments a
          where a.client_id=c.id and a.staff_id=v_staff.id)),'[]'::jsonb)
      else '[]'::jsonb end
  );
end;
$$;

create or replace function public.staff_save_appointment(
  p_code text, p_id uuid, p_client_name text, p_client_phone text,
  p_date date, p_start int, p_items jsonb, p_total int, p_duration int, p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_private public.staff_private;
  v_staff public.staff;
  v_client uuid;
  v_end int := p_start + p_duration;
  v_phone text := regexp_replace(coalesce(p_client_phone,''), '\D','','g');
  v_name text := trim(coalesce(p_client_name,''));
  v_existing public.appointments;
  v_today date := (now() at time zone 'America/Asuncion')::date;
  v_blocks jsonb;
  v_total int := greatest(coalesce(p_total,0),0);
begin
  select * into v_private from public.staff_private
  where code=upper(regexp_replace(coalesce(p_code,''),'[^A-Z0-9]','','g')) and portal_role='manager';
  if not found then raise exception 'No tenés permiso para registrar turnos.'; end if;
  select * into v_staff from public.staff where id=v_private.id and active;
  if not found then raise exception 'Tu acceso profesional no está activo.'; end if;
  if v_name='' or length(v_name)>100 then raise exception 'Ingresá el nombre de la clienta.'; end if;
  if length(v_phone)<8 or length(v_phone)>15 then raise exception 'Revisá el WhatsApp de la clienta.'; end if;
  if p_date < v_today or p_date > v_today + 365 then raise exception 'Revisá la fecha del turno.'; end if;
  if p_start not between 0 and 1439 or p_duration not between 15 and 720 or v_end>1440 then
    raise exception 'Revisá el horario y la duración.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>12 then
    raise exception 'Agregá al menos un servicio.'; end if;
  if length(coalesce(p_notes,''))>500 then raise exception 'La observación es demasiado larga.'; end if;

  if p_id is not null then
    select * into v_existing from public.appointments
    where id=p_id and staff_id=v_staff.id and created_by_staff=v_staff.id and status not in ('cancelled','no_show');
    if not found then raise exception 'Solo podés modificar los turnos que registraste vos.'; end if;
  end if;

  select e.blocks into v_blocks from public.exceptions e where e.date=p_date and e.staff_id=v_staff.id limit 1;
  if v_blocks is null then
    select e.blocks into v_blocks from public.exceptions e where e.date=p_date and e.staff_id is null limit 1;
  end if;
  if v_blocks is null then
    v_blocks := coalesce(v_staff.hours, (select data->'hours' from public.settings where id=1));
    v_blocks := coalesce(v_blocks -> (extract(dow from p_date)::int), '[]'::jsonb);
  end if;
  if not exists(select 1 from jsonb_array_elements(coalesce(v_blocks,'[]'::jsonb)) b
    where (b->>0)::int<=p_start and
      (v_end<=(b->>1)::int or ((b->>1)::int=(select max((x->>1)::int) from jsonb_array_elements(v_blocks) x) and p_start<=(b->>1)::int))) then
    raise exception 'Ese horario está fuera de tu jornada.'; end if;

  perform pg_advisory_xact_lock(hashtext(v_staff.id||p_date::text));
  if exists(select 1 from public.appointments a where a.staff_id=v_staff.id and a.date=p_date
    and a.status not in ('cancelled','no_show') and a.start_min<v_end and a.end_min>p_start
    and (p_id is null or a.id<>p_id)) then raise exception 'Ese horario ya está ocupado. Elegí otro.'; end if;

  if v_phone ~ '^0\d{9}$' then v_phone:='595'||substr(v_phone,2);
  elsif v_phone ~ '^9\d{8}$' then v_phone:='595'||v_phone; end if;
  insert into public.clients(name,phone) values(v_name,v_phone)
    on conflict(phone) do update set name=excluded.name returning id into v_client;

  if p_id is null then
    insert into public.appointments(kind,client_id,client_name,client_phone,staff_id,date,start_min,end_min,
      items,total,final_total,paid_amount,status,notes,source,created_by_staff)
    values('appointment',v_client,v_name,v_phone,v_staff.id,p_date,p_start,v_end,p_items,v_total,v_total,0,
      'confirmed',nullif(trim(coalesce(p_notes,'')),''),'panel',v_staff.id)
    returning * into v_existing;
  else
    update public.appointments set client_id=v_client,client_name=v_name,client_phone=v_phone,date=p_date,
      start_min=p_start,end_min=v_end,items=p_items,total=v_total,
      final_total=case when coalesce(paid_amount,0)=0 then v_total else greatest(coalesce(final_total,total),paid_amount) end,notes=nullif(trim(coalesce(p_notes,'')),''),
      updated_by_staff=v_staff.id
    where id=p_id returning * into v_existing;
  end if;
  return jsonb_build_object('id',v_existing.id,'status',v_existing.status,'total',v_existing.total);
end;
$$;

create or replace function public.staff_update_payment(p_code text,p_id uuid,p_paid int,p_final_total int)
returns boolean
language plpgsql security definer set search_path=public as $$
declare v_staff public.staff;
begin
  select st.* into v_staff from public.staff_private sp join public.staff st on st.id=sp.id
  where sp.code=upper(regexp_replace(coalesce(p_code,''),'[^A-Z0-9]','','g'))
    and sp.portal_role='manager' and st.active;
  if not found then raise exception 'No tenés permiso para registrar pagos.'; end if;
  if p_paid<0 or p_final_total<0 or p_paid>p_final_total then raise exception 'Revisá los importes.'; end if;
  update public.appointments set paid_amount=p_paid,final_total=p_final_total
  where id=p_id and staff_id=v_staff.id and created_by_staff=v_staff.id and status not in ('cancelled','no_show');
  if not found then raise exception 'No se encontró ese turno propio.'; end if;
  return true;
end;
$$;

create or replace function public.staff_complete_appointment(p_code text,p_id uuid)
returns boolean
language plpgsql security definer set search_path=public as $$
declare v_staff public.staff;
begin
  select st.* into v_staff from public.staff_private sp join public.staff st on st.id=sp.id
  where sp.code=upper(regexp_replace(coalesce(p_code,''),'[^A-Z0-9]','','g'))
    and sp.portal_role='manager' and st.active;
  if not found then raise exception 'No tenés permiso para finalizar turnos.'; end if;
  update public.appointments set completed_at=now()
  where id=p_id and staff_id=v_staff.id and created_by_staff=v_staff.id and status='confirmed';
  if not found then raise exception 'No se encontró ese turno propio confirmado.'; end if;
  return true;
end;
$$;

create or replace function public.staff_cancel_appointment(p_code text,p_id uuid)
returns boolean
language plpgsql security definer set search_path=public as $$
declare v_staff public.staff;
begin
  select st.* into v_staff from public.staff_private sp join public.staff st on st.id=sp.id
  where sp.code=upper(regexp_replace(coalesce(p_code,''),'[^A-Z0-9]','','g'))
    and sp.portal_role='manager' and st.active;
  if not found then raise exception 'No tenés permiso para cancelar turnos.'; end if;
  update public.appointments set status='cancelled',updated_by_staff=v_staff.id
  where id=p_id and staff_id=v_staff.id and created_by_staff=v_staff.id and status not in ('cancelled','no_show');
  if not found then raise exception 'Solo podés cancelar los turnos que registraste vos.'; end if;
  return true;
end;
$$;

revoke all on function public.staff_portal_data(text) from public;
revoke all on function public.staff_save_appointment(text,uuid,text,text,date,int,jsonb,int,int,text) from public;
revoke all on function public.staff_update_payment(text,uuid,int,int) from public;
revoke all on function public.staff_complete_appointment(text,uuid) from public;
revoke all on function public.staff_cancel_appointment(text,uuid) from public;
grant execute on function public.staff_portal_data(text) to anon,authenticated;
grant execute on function public.staff_save_appointment(text,uuid,text,text,date,int,jsonb,int,int,text) to anon,authenticated;
grant execute on function public.staff_update_payment(text,uuid,int,int) to anon,authenticated;
grant execute on function public.staff_complete_appointment(text,uuid) to anon,authenticated;
grant execute on function public.staff_cancel_appointment(text,uuid) to anon,authenticated;
