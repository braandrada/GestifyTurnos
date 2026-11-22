# Despliegue de Gestify Turnos (Vercel + Supabase + Mercado Pago)

## 0. Antes de empezar
- **Plan de Vercel:** el plan gratuito (Hobby) es solo para uso personal y no comercial. Gestify cobra abonos a comercios, así que
  para producción corresponde el plan **Pro**. En Hobby los crons de Vercel corren como máximo una vez por día; por eso los recordatorios
  se programan desde Supabase (paso 6), que funciona en cualquier plan.
- Cuentas necesarias: GitHub, Vercel, Supabase, Mercado Pago (aplicación en "Tus integraciones") y un proveedor de correo para el SMTP.

## 1. Supabase
1. Proyecto nuevo (o de prueba). Correr en **SQL Editor**, en orden: `supabase/migrations/001_...`, `002_...`, `003_...` y `004_...`
   (la 004 agrega los bloqueos de agenda y protege el slug; si ya tenías corridas las tres primeras, corré solo la 004).
2. **Project Settings > API**: copiar la URL, la clave pública (anon/publishable) y la `service_role` (secreta).
3. Configurar **Auth** según `MIGRATION.md` (plantillas, Google, SMTP propio, TOTP). Las *Redirect URLs* se completan en el paso 4, cuando ya sepas tu dominio.

## 2. GitHub
```bash
git init
git add .
git commit -m "Gestify Turnos: migración a Supabase y Vercel"
git branch -M main
git remote add origin https://github.com/braandrada/GestifyTurnos.git
git push -u origin main
```
El `.gitignore` (dentro de `gestify/`) excluye `.env` y `node_modules`: confirmá con `git status` que no aparecen antes de hacer el commit.
Si alguna vez se subió un `.env` con claves reales, **rotalas** (Supabase > Project Settings > API, y los tokens de Mercado Pago):
borrar el archivo del repo no las borra del historial de GitHub.

## 3. Vercel
1. *Add New > Project* → importar el repositorio. **Root Directory: `gestify`** (la app está en esa subcarpeta del repo).
   Vercel detecta TanStack Start; no hace falta `vercel.json`. Instala con `npm ci` usando `package-lock.json`.
   (No agregues `crons` en `vercel.json` si estás en Hobby: el deploy falla.)
2. **Settings > Environment Variables** (Production y Preview), cargar todo lo de `.env.example`:

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto de Supabase |
| `VITE_SUPABASE_ANON_KEY` | clave pública (anon / publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | clave secreta `service_role` (sin prefijo `VITE_`) |
| `APP_URL` | dominio final **con** `https://` y sin barra final: `https://TU-DOMINIO` |
| `PLATFORM_MP_ACCESS_TOKEN` | access token de producción de TU cuenta de Mercado Pago |
| `MP_WEBHOOK_SECRET` | clave secreta de Webhooks de tu aplicación (paso 5) |
| `MP_WEBHOOK_STRICT` | `false` al principio |
| `CRON_SECRET` | cadena larga aleatoria (`openssl rand -hex 32`) |
| `REQUIRE_ADMIN_MFA` | `false` hasta enrolar tu TOTP; después `true` |

   Las variables `VITE_*` se incorporan **al compilar**: si las cambiás, hay que redeployar.
3. *Deploy*. Si usás dominio propio: **Settings > Domains**, y actualizá `APP_URL` con ese dominio.

## 4. Volver a Supabase con el dominio
- **Authentication > URL Configuration**: *Site URL* = `https://TU-DOMINIO`; *Redirect URLs* = `https://TU-DOMINIO/**` y `http://localhost:3000/**`.
- Google Cloud: autorizar `https://TU-PROYECTO.supabase.co/auth/v1/callback` (si usás Google).

## 5. Mercado Pago
1. **Tus integraciones > tu aplicación > Webhooks > Configurar notificaciones**:
   - URL de producción: `https://TU-DOMINIO/api/mp-suscripciones`
   - Evento: **Planes y suscripciones** (los avisos de autorización del débito y de cada cobro).
   - Guardar y copiar la **clave secreta** a `MP_WEBHOOK_SECRET` en Vercel (redeploy).
2. Las señas de los turnos no usan esta URL: cada preferencia lleva su propia `notification_url` (`/api/mp-webhook`) y se avisa a la cuenta del comercio.
3. Probá con credenciales de prueba antes de producción (paso 8).

## 6. Tareas programadas
- Correr `003_cron_programado.sql` (libera turnos impagos cada minuto).
- Recordatorios y abonos vencidos: descomentar el bloque 2 de ese archivo con tu dominio y el mismo valor de `CRON_SECRET`.
- Alternativa en Vercel Pro (en `vercel.json`): `{ "crons": [{ "path": "/api/cron-reminders", "schedule": "*/15 * * * *" }] }`; Vercel manda `Authorization: Bearer <CRON_SECRET>` solo.
- Prueba manual: `curl -H "Authorization: Bearer TU_CRON_SECRET" https://TU-DOMINIO/api/cron-reminders` → `{"ok":true,...}`.

## 7. Super admin
1. Registrate en `/register` con tu email (confirmá con el código).
2. SQL Editor: `update public.profiles set tipo_usuario = 'super_admin' where email = 'TU_EMAIL';`
3. Entrá a `/admin`: te lleva a `/mfa` para vincular tu app de autenticación.
4. Cuando entre bien: `REQUIRE_ADMIN_MFA=true` en Vercel y redeploy.

## 8. Prueba completa antes de abrirlo
1. En `/admin` crear un comercio de prueba con otro email: llega la invitación → elegir contraseña → entra a `/panel`.
2. Cargar servicios (con seña), horarios y, en *Integraciones*, un access token de prueba de Mercado Pago de un vendedor de prueba.
3. Abrir `/<slug-del-comercio>`, reservar y pagar la seña con una tarjeta de prueba → el turno debe pasar a *confirmado*.
   Si no cambia solo, mirá **Vercel > Logs** filtrando `/api/mp-webhook`.
4. Reservar el mismo horario desde dos pestañas: la segunda debe avisar que se ocupó.
5. Abono: en `/panel/abono` activar el débito automático con un usuario comprador de prueba; el cobro debe registrarse en "Últimos cobros".
6. Con el primer aviso real de suscripción, revisar los logs de `/api/mp-suscripciones`: si no aparece la advertencia de firma, pasá `MP_WEBHOOK_STRICT=true`.

## 9. Para salir a producción
- [ ] SMTP propio en Supabase y plantillas de email revisadas.
- [ ] `PLATFORM_MP_ACCESS_TOKEN` y token de comercios de **producción** (no de prueba).
- [ ] `REQUIRE_ADMIN_MFA=true` y `MP_WEBHOOK_STRICT=true`.
- [ ] Plan Pro de Vercel y dominio propio con `APP_URL` actualizado.
- [ ] Backups de Supabase habilitados (plan que los incluya) y `service_role` guardada solo en Vercel.
