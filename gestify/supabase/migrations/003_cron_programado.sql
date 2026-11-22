-- =====================================================================
-- 003 — Tareas programadas dentro de Supabase (funciona con cualquier plan de Vercel)
-- Antes: Database > Extensions > activar "pg_cron" y "pg_net".
-- =====================================================================

-- 1) Liberar cada minuto los horarios de turnos con la seña vencida (solo SQL, no necesita llamar a la app).
select cron.schedule(
  'gestify-expirar-turnos',
  '* * * * *',
  $$ select public.expire_pending_appointments(); $$
);

-- 2) OPCIONAL pero recomendado: recordatorios por WhatsApp y abonos vencidos, cada 15 minutos,
--    llamando a la app desplegada. EDITÁ la URL y el secreto y descomentá.
--    El secreto tiene que ser EXACTAMENTE el mismo que CRON_SECRET en Vercel.
--
-- select vault.create_secret('PEGA_ACA_TU_CRON_SECRET', 'cron_secret');   -- una sola vez
--
-- select cron.schedule(
--   'gestify-recordatorios',
--   '*/15 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://TU-DOMINIO/api/cron-reminders',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 20000
--   );
--   $$
-- );

-- Ver y borrar tareas:
--   select jobid, jobname, schedule, active from cron.job;
--   select cron.unschedule('gestify-recordatorios');
