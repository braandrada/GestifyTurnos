-- =====================================================================
-- 006 — Configuración de la plataforma (editable desde el panel de super admin, sin redeploy)
-- Correr DESPUÉS de 005 (SQL Editor > Run). Es idempotente.
-- =====================================================================

-- Una sola fila (id = true).
create table if not exists public.platform_settings (
  id                     boolean primary key default true check (id),
  precio_mensual_default numeric(12,2) not null default 0 check (precio_mensual_default >= 0),
  dias_prueba            integer not null default 14 check (dias_prueba between 1 and 90),
  updated_at             timestamptz not null default now()
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists platform_settings_updated_at on public.platform_settings;
create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

-- Solo el super admin la lee/edita desde el navegador; el servidor usa la service role.
drop policy if exists platform_settings_admin on public.platform_settings;
create policy platform_settings_admin on public.platform_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
revoke all on public.platform_settings from anon;
