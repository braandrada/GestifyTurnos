-- =====================================================================
-- 005 — Profesionales (staff): agenda, servicios y horarios por profesional
-- Correr DESPUÉS de 004 (SQL Editor > Run). Es idempotente.
--
-- Modelo:
--  * staff: profesionales del comercio.
--  * staff_services: qué servicios hace cada uno. Sin filas = hace TODOS los servicios.
--  * schedules.staff_id: franjas propias. Si un profesional no tiene franjas activas, usa las del local (staff_id null).
--  * blocks.staff_id: null = bloquea el local entero; con valor = solo a ese profesional.
--  * appointments.staff_id: null = turno "del local" (comercios sin profesionales, como hasta ahora).
--  * Anti doble reserva: por profesional; los turnos sin profesional siguen la regla vieja (uno a la vez por local).
-- Las FK compuestas (id, tenant_id) garantizan que nunca se mezclen datos de dos comercios.
-- =====================================================================

-- ---------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------
create table if not exists public.staff (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  nombre     text not null check (char_length(nombre) between 1 and 80),
  activo     boolean not null default true,
  orden      integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create index if not exists staff_tenant_idx on public.staff (tenant_id, orden);

drop trigger if exists staff_updated_at on public.staff;
create trigger staff_updated_at before update on public.staff
  for each row execute function public.set_updated_at();

-- services necesita (id, tenant_id) único para la FK compuesta de staff_services
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'services_id_tenant_key') then
    alter table public.services add constraint services_id_tenant_key unique (id, tenant_id);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- staff_services
-- ---------------------------------------------------------------------
create table if not exists public.staff_services (
  staff_id   uuid not null,
  service_id uuid not null,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, service_id),
  foreign key (staff_id, tenant_id) references public.staff (id, tenant_id) on delete cascade,
  foreign key (service_id, tenant_id) references public.services (id, tenant_id) on delete cascade
);
create index if not exists staff_services_tenant_idx on public.staff_services (tenant_id);

-- ---------------------------------------------------------------------
-- staff_id en schedules, blocks y appointments (FK compuesta = mismo comercio)
-- ---------------------------------------------------------------------
alter table public.schedules    add column if not exists staff_id uuid;
alter table public.blocks       add column if not exists staff_id uuid;
alter table public.appointments add column if not exists staff_id uuid;
alter table public.appointments add column if not exists staff_nombre text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'schedules_staff_fk') then
    alter table public.schedules add constraint schedules_staff_fk
      foreign key (staff_id, tenant_id) references public.staff (id, tenant_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'blocks_staff_fk') then
    alter table public.blocks add constraint blocks_staff_fk
      foreign key (staff_id, tenant_id) references public.staff (id, tenant_id) on delete cascade;
  end if;
  -- Un profesional con turnos (también historial) NO se puede borrar: se desactiva. Si se pasaran sus turnos a
  -- staff_id null, chocarían con la regla "uno a la vez por local" y se perdería a quién correspondía cada turno.
  -- El mismo comercio lo valida el trigger de abajo.
  if not exists (select 1 from pg_constraint where conname = 'appointments_staff_fk') then
    alter table public.appointments add constraint appointments_staff_fk
      foreign key (staff_id) references public.staff (id) on delete restrict;
  end if;
end $$;

create index if not exists schedules_staff_idx    on public.schedules (staff_id) where staff_id is not null;
create index if not exists blocks_staff_idx       on public.blocks (staff_id) where staff_id is not null;
create index if not exists appointments_staff_idx on public.appointments (staff_id, fecha_hora_inicio) where staff_id is not null;

-- El profesional de un turno tiene que ser del mismo comercio (también para inserts desde el panel con RLS).
create or replace function public.check_appointment_staff_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.staff_id is not null and not exists (
    select 1 from public.staff s where s.id = new.staff_id and s.tenant_id = new.tenant_id
  ) then
    raise exception 'El profesional no pertenece a este comercio';
  end if;
  return new;
end $$;

drop trigger if exists appointments_staff_tenant on public.appointments;
create trigger appointments_staff_tenant before insert or update of staff_id, tenant_id on public.appointments
  for each row execute function public.check_appointment_staff_tenant();

-- ---------------------------------------------------------------------
-- Anti doble reserva por profesional
-- ---------------------------------------------------------------------
alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments drop constraint if exists appointments_no_overlap_local;
alter table public.appointments drop constraint if exists appointments_no_overlap_staff;

-- Turnos sin profesional: como antes, uno a la vez por comercio.
alter table public.appointments add constraint appointments_no_overlap_local exclude using gist (
  tenant_id with =,
  tstzrange(fecha_hora_inicio, fecha_hora_fin, '[)') with &&
) where (staff_id is null and estado in ('pendiente_pago', 'confirmado'));

-- Turnos con profesional: uno a la vez por profesional.
alter table public.appointments add constraint appointments_no_overlap_staff exclude using gist (
  staff_id with =,
  tstzrange(fecha_hora_inicio, fecha_hora_fin, '[)') with &&
) where (staff_id is not null and estado in ('pendiente_pago', 'confirmado'));

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.staff          enable row level security;
alter table public.staff_services enable row level security;

drop policy if exists staff_tenant_all on public.staff;
create policy staff_tenant_all on public.staff for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin())
  with check (tenant_id = public.current_tenant_id() or public.is_super_admin());

drop policy if exists staff_services_tenant_all on public.staff_services;
create policy staff_services_tenant_all on public.staff_services for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin())
  with check (tenant_id = public.current_tenant_id() or public.is_super_admin());

-- El visitante anónimo no lee estas tablas: la reserva pública pasa por el servidor.
revoke all on public.staff, public.staff_services from anon;
