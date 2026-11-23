-- =====================================================================
-- 004 — Bloqueos de agenda (feriados, vacaciones, francos puntuales) y ajustes de seguridad
-- Correr DESPUÉS de 001, 002 y 003 (SQL Editor > Run). Es idempotente: se puede volver a correr.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) blocks: rangos en los que el comercio NO toma turnos, además de los horarios semanales.
--    Un día franco completo = inicio 00:00 y fin 00:00 del día siguiente (hora de Argentina).
-- ---------------------------------------------------------------------
create table if not exists public.blocks (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  inicio     timestamptz not null,
  fin        timestamptz not null,
  motivo     text check (char_length(motivo) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fin > inicio)
);
create index if not exists blocks_tenant_rango_idx on public.blocks (tenant_id, inicio, fin);

drop trigger if exists blocks_updated_at on public.blocks;
create trigger blocks_updated_at before update on public.blocks
  for each row execute function public.set_updated_at();

alter table public.blocks enable row level security;

drop policy if exists blocks_tenant_all on public.blocks;
create policy blocks_tenant_all on public.blocks for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin())
  with check (tenant_id = public.current_tenant_id() or public.is_super_admin());

-- El visitante anónimo nunca lee la tabla: la disponibilidad la calcula el servidor.
revoke all on public.blocks from anon;

-- ---------------------------------------------------------------------
-- 2) El comerciante tampoco puede cambiar el slug (link público) ni el id de su comercio.
--    Antes solo lo impedía el servidor; desde el navegador (RLS) se podía.
-- ---------------------------------------------------------------------
create or replace function public.protect_tenant_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    if new.id is distinct from old.id
       or new.slug is distinct from old.slug
       or new.activo is distinct from old.activo
       or new.owner_id is distinct from old.owner_id
       or new.owner_email is distinct from old.owner_email
       or new.notas is distinct from old.notas then
      raise exception 'No autorizado a modificar esos campos del comercio';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3) Slugs reservados: chocan con rutas de la app (/admin, /panel, /login, /api…).
--    NOT VALID: no falla si ya existiera alguno; aplica a altas y cambios nuevos.
-- ---------------------------------------------------------------------
alter table public.tenants drop constraint if exists tenants_slug_reservado;
alter table public.tenants add constraint tenants_slug_reservado check (
  slug not in ('admin', 'panel', 'login', 'register', 'mfa', 'api', 'pago', 'auth',
               'forgot-password', 'reset-password', 'www', 'app', 'assets', 'static')
) not valid;

-- ---------------------------------------------------------------------
-- 4) La función pública de horarios ocupados también contempla los bloqueos
--    (misma regla que el servidor: un pendiente sin vencimiento ocupa el horario).
-- ---------------------------------------------------------------------
create or replace function public.public_get_busy_slots(p_slug text, p_desde timestamptz, p_hasta timestamptz)
returns table (inicio timestamptz, fin timestamptz)
language sql stable security definer set search_path = public as $$
  select a.fecha_hora_inicio, a.fecha_hora_fin
  from public.appointments a
  join public.tenants t on t.id = a.tenant_id
  where t.slug = p_slug and t.activo
    and a.estado in ('pendiente_pago', 'confirmado')
    and (a.estado = 'confirmado' or a.expira_pago_en is null or a.expira_pago_en > now())
    and a.fecha_hora_inicio < p_hasta
    and a.fecha_hora_fin > p_desde
  union all
  select b.inicio, b.fin
  from public.blocks b
  join public.tenants t on t.id = b.tenant_id
  where t.slug = p_slug and t.activo
    and b.inicio < p_hasta
    and b.fin > p_desde;
$$;

-- ---------------------------------------------------------------------
-- 5) Índice para el anti-spam de reservas impagas por teléfono.
-- ---------------------------------------------------------------------
create index if not exists appointments_pendientes_tel_idx
  on public.appointments (tenant_id, cliente_telefono) where estado = 'pendiente_pago';
