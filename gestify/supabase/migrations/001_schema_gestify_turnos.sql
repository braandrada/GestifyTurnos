-- =====================================================================
-- Gestify Turnos — esquema inicial (migrado desde las entidades de Base44)
-- Pegar completo en Supabase > SQL Editor > Run (en un proyecto NUEVO o de prueba).
-- Convenciones: ids uuid, fechas timestamptz, columnas en español como en Base44
-- (así el código migrado cambia lo mínimo). created_date/updated_date -> created_at/updated_at.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Utilidad: updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- tenants (comercios)
-- ---------------------------------------------------------------------
create table public.tenants (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique
                       check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre_comercio    text not null,
  rubro              text,
  direccion          text,
  telefono_whatsapp  text,
  politica_sena      text,
  horas_aviso_previo integer not null default 24 check (horas_aviso_previo >= 0),
  owner_id           uuid references auth.users(id) on delete set null,
  owner_email        text,
  activo             boolean not null default true,
  notas              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- profiles (reemplaza los campos tenant_id y tipo_usuario del User de Base44)
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  full_name    text,
  tenant_id    uuid references public.tenants(id) on delete set null,
  tipo_usuario text not null default 'comerciante'
                 check (tipo_usuario in ('comerciante', 'super_admin')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Helpers para las políticas RLS (security definer: evitan recursión de RLS)
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and tipo_usuario = 'super_admin'
  );
$$;

create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

-- Alta automática de perfil al registrarse un usuario
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un usuario común NO puede cambiarse su tenant_id ni su tipo_usuario
-- (equivale al "rls update: admin" de esos campos en Base44).
-- auth.uid() es null desde el SQL Editor y con la service role: ahí sí se permite.
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    if new.tenant_id is distinct from old.tenant_id
       or new.tipo_usuario is distinct from old.tipo_usuario
       or new.id is distinct from old.id then
      raise exception 'No autorizado a modificar tenant_id ni tipo_usuario';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Un comerciante puede editar los datos de su local, pero no activarlo/desactivarlo
-- ni cambiar de dueño ni tocar las notas internas.
create or replace function public.protect_tenant_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    if new.activo is distinct from old.activo
       or new.owner_id is distinct from old.owner_id
       or new.owner_email is distinct from old.owner_email
       or new.notas is distinct from old.notas then
      raise exception 'No autorizado a modificar esos campos del comercio';
    end if;
  end if;
  return new;
end $$;

create trigger tenants_protect before update on public.tenants
  for each row execute function public.protect_tenant_fields();

-- ---------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------
create table public.services (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  nombre           text not null,
  descripcion      text,
  duracion_minutos integer not null default 30 check (duracion_minutos > 0),
  precio_total     numeric(12,2) not null default 0 check (precio_total >= 0),
  monto_sena       numeric(12,2) not null default 0 check (monto_sena >= 0),
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index services_tenant_idx on public.services (tenant_id);

-- ---------------------------------------------------------------------
-- schedules (horarios de atención; 0 = domingo ... 6 = sábado)
-- Ojo: hora_inicio/hora_fin pasan de texto "HH:MM" a tipo time ("HH:MM:SS").
-- ---------------------------------------------------------------------
create table public.schedules (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fin    time not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (hora_fin > hora_inicio)
);
create index schedules_tenant_idx on public.schedules (tenant_id, dia_semana);

-- ---------------------------------------------------------------------
-- appointments (turnos)
-- ---------------------------------------------------------------------
create table public.appointments (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  service_id             uuid references public.services(id) on delete set null,
  servicio_nombre        text,
  cliente_nombre         text not null,
  cliente_telefono       text,
  fecha_hora_inicio      timestamptz not null,
  fecha_hora_fin         timestamptz not null,
  estado                 text not null default 'pendiente_pago'
                           check (estado in ('pendiente_pago','confirmado','cancelado','expirado')),
  mp_preference_id       text,
  mp_payment_id          text,
  expira_pago_en         timestamptz,
  recordatorio_1_enviado boolean not null default false,
  recordatorio_2_enviado boolean not null default false,
  -- El código se usa como "llave" pública (/pago/:codigo) y expone datos del turno: UUID completo, no adivinable.
  codigo_publico         text not null unique default gen_random_uuid()::text,
  monto_sena             numeric(12,2) not null default 0 check (monto_sena >= 0),
  notas                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (fecha_hora_fin > fecha_hora_inicio),
  -- Anti doble reserva: no se pisan dos turnos vivos del mismo comercio.
  -- SUPUESTO: cada comercio atiende un turno a la vez (hoy no hay "profesionales").
  -- Si algún rubro necesita turnos simultáneos, hay que quitar esto y modelar recursos.
  constraint appointments_no_overlap exclude using gist (
    tenant_id with =,
    tstzrange(fecha_hora_inicio, fecha_hora_fin, '[)') with &&
  ) where (estado in ('pendiente_pago', 'confirmado'))
);
create index appointments_tenant_inicio_idx on public.appointments (tenant_id, fecha_hora_inicio);
create index appointments_pendientes_idx on public.appointments (expira_pago_en) where estado = 'pendiente_pago';
create index appointments_mp_preference_idx on public.appointments (mp_preference_id);
create unique index appointments_mp_payment_uidx on public.appointments (mp_payment_id) where mp_payment_id is not null;

-- ---------------------------------------------------------------------
-- tenant_subscriptions (abono mensual del comercio a Gestify)
-- ---------------------------------------------------------------------
create table public.tenant_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null unique references public.tenants(id) on delete cascade,
  precio_mensual           numeric(12,2) not null default 0 check (precio_mensual >= 0),
  estado_suscripcion       text not null default 'activa'
                             check (estado_suscripcion in ('activa','vencida','suspendida')),
  fecha_vencimiento_actual timestamptz,
  dia_vencimiento          smallint check (dia_vencimiento between 1 and 31),
  mp_preapproval_id        text unique,
  mp_estado                text,   -- pending, authorized, cancelled, paused
  mp_iniciada_en           timestamptz,
  mp_ultimo_pago           timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- subscription_payments (cada cobro del abono)
-- mp_payment_id único => el webhook de Mercado Pago es idempotente.
-- ---------------------------------------------------------------------
create table public.subscription_payments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  tenant_nombre    text,
  monto            numeric(12,2) not null check (monto >= 0),
  metodo_pago      text not null default 'transferencia'
                     check (metodo_pago in ('transferencia','efectivo','mercadopago','otro')),
  periodo_cubierto text,
  fecha_pago       timestamptz not null default now(),
  notas            text,
  registrado_por   text,
  mp_payment_id    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index subscription_payments_tenant_idx on public.subscription_payments (tenant_id, fecha_pago desc);
create unique index subscription_payments_mp_uidx on public.subscription_payments (mp_payment_id) where mp_payment_id is not null;

-- ---------------------------------------------------------------------
-- tenant_integrations (SECRETOS: token de Mercado Pago y WhatsApp)
-- En Base44 el comerciante podía leer esto. Acá NO: queda sin ninguna política,
-- o sea solo accesible desde el servidor con la service role.
-- ---------------------------------------------------------------------
create table public.tenant_integrations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null unique references public.tenants(id) on delete cascade,
  mp_access_token  text,
  whatsapp_api_url text,
  whatsapp_token   text,
  whatsapp_activo  boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Vista segura para que el panel muestre "conectado / no conectado" sin exponer tokens
create view public.tenant_integrations_status as
  select tenant_id,
         (mp_access_token is not null and mp_access_token <> '')                    as mp_conectado,
         (whatsapp_api_url is not null and whatsapp_token is not null)              as whatsapp_configurado,
         whatsapp_activo
  from public.tenant_integrations
  where tenant_id = public.current_tenant_id() or public.is_super_admin();

-- ---------------------------------------------------------------------
-- Triggers updated_at
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tenants','profiles','services','schedules','appointments',
                           'tenant_subscriptions','subscription_payments','tenant_integrations']
  loop
    execute format(
      'create trigger %I_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.tenants               enable row level security;
alter table public.profiles              enable row level security;
alter table public.services              enable row level security;
alter table public.schedules             enable row level security;
alter table public.appointments          enable row level security;
alter table public.tenant_subscriptions  enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.tenant_integrations   enable row level security;

-- profiles: cada uno ve y edita el suyo (el trigger protege rol y tenant); el super admin todo
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_super_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());

-- tenants: ve/edita el suyo; crear y borrar solo super admin
create policy tenants_select on public.tenants for select to authenticated
  using (public.is_super_admin() or id = public.current_tenant_id() or owner_id = auth.uid());
create policy tenants_insert on public.tenants for insert to authenticated
  with check (public.is_super_admin());
create policy tenants_update on public.tenants for update to authenticated
  using (public.is_super_admin() or id = public.current_tenant_id() or owner_id = auth.uid())
  with check (public.is_super_admin() or id = public.current_tenant_id() or owner_id = auth.uid());
create policy tenants_delete on public.tenants for delete to authenticated
  using (public.is_super_admin());

-- services / schedules / appointments: el comercio maneja lo suyo; super admin todo
do $$
declare t text;
begin
  foreach t in array array['services','schedules','appointments']
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (tenant_id = public.current_tenant_id() or public.is_super_admin())
         with check (tenant_id = public.current_tenant_id() or public.is_super_admin())',
      t || '_tenant_all', t);
  end loop;
end $$;

-- abono y pagos del abono: el comercio solo lee lo suyo; escribe el super admin
-- (el webhook de Mercado Pago escribe con la service role, que ignora RLS)
create policy tenant_subscriptions_select on public.tenant_subscriptions for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
create policy tenant_subscriptions_admin_write on public.tenant_subscriptions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy subscription_payments_select on public.subscription_payments for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
create policy subscription_payments_admin_write on public.subscription_payments for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- tenant_integrations: sin políticas = nadie desde el cliente. Defensa extra:
revoke all on public.tenant_integrations from anon, authenticated;
grant select on public.tenant_integrations_status to authenticated;

-- ---------------------------------------------------------------------
-- Reserva pública (cliente final sin login). Solo exponen lo necesario.
-- Crear el turno + preferencia de Mercado Pago se hace desde tu servidor (service role).
-- ---------------------------------------------------------------------
create or replace function public.public_get_booking_info(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tenant', jsonb_build_object(
      'id', t.id, 'slug', t.slug, 'nombre_comercio', t.nombre_comercio, 'rubro', t.rubro,
      'direccion', t.direccion, 'telefono_whatsapp', t.telefono_whatsapp,
      'politica_sena', t.politica_sena, 'horas_aviso_previo', t.horas_aviso_previo),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nombre', s.nombre, 'descripcion', s.descripcion,
        'duracion_minutos', s.duracion_minutos, 'precio_total', s.precio_total,
        'monto_sena', s.monto_sena) order by s.nombre)
      from public.services s where s.tenant_id = t.id and s.activo), '[]'::jsonb),
    'schedules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dia_semana', h.dia_semana, 'hora_inicio', h.hora_inicio, 'hora_fin', h.hora_fin)
        order by h.dia_semana, h.hora_inicio)
      from public.schedules h where h.tenant_id = t.id and h.activo), '[]'::jsonb)
  )
  from public.tenants t
  where t.slug = p_slug and t.activo;
$$;

-- Horarios ocupados (sin datos del cliente)
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
    and a.fecha_hora_fin > p_desde;
$$;

grant execute on function public.public_get_booking_info(text) to anon, authenticated;
grant execute on function public.public_get_busy_slots(text, timestamptz, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Vencimiento de turnos con seña impaga (libera el horario)
-- Llamarla desde un cron (pg_cron o Vercel Cron) cada 1-5 minutos,
-- y también justo antes de crear un turno nuevo.
-- ---------------------------------------------------------------------
create or replace function public.expire_pending_appointments()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.appointments
     set estado = 'expirado'
   where estado = 'pendiente_pago'
     and expira_pago_en is not null
     and expira_pago_en < now();
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.expire_pending_appointments() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- DESPUÉS DE CORRER ESTO: registrá tu usuario en la app (o en Auth > Users) y
-- convertilo en super admin desde el SQL Editor:
--   update public.profiles set tipo_usuario = 'super_admin' where email = 'TU_EMAIL';
-- ---------------------------------------------------------------------
