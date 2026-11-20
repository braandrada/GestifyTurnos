-- =====================================================================
-- 002 — Ajustes para el código de servidor de Gestify Turnos
-- Correr DESPUÉS de 001_schema_gestify_turnos.sql (SQL Editor > Run).
-- =====================================================================

-- La función que libera turnos impagos se revocó para anon/authenticated en la 001.
-- El servidor (service role) tiene que poder llamarla (booking, cron, automatizaciones).
grant execute on function public.expire_pending_appointments() to service_role;

-- ---------------------------------------------------------------------
-- OPCIONAL (recomendado): expirar turnos impagos cada minuto dentro de Supabase,
-- sin depender del plan de cron de Vercel.
-- 1) Database > Extensions > activar "pg_cron"  2) descomentar y correr:
--
-- select cron.schedule(
--   'expire-pending-appointments',
--   '* * * * *',
--   $$ select public.expire_pending_appointments(); $$
-- );
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- OPCIONAL (cuando el TOTP del super admin ya funcione, paso 3):
-- que la base también exija aal2 al super admin, no solo el servidor.
--
-- create or replace function public.is_super_admin()
-- returns boolean language sql stable security definer set search_path = public as $$
--   select exists (
--     select 1 from public.profiles
--     where id = auth.uid() and tipo_usuario = 'super_admin'
--   ) and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
-- $$;
-- ---------------------------------------------------------------------
