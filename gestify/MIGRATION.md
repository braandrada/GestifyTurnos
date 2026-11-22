# Estado de la migración Base44 → Supabase + Vercel

## Hecho — pasos 1 y 2
- Config: `vite.config.js` (TanStack Start + Nitro), `package.json` sin dependencias de Base44/Cloudflare, `.env.example`.
- Supabase: `src/lib/supabase.client.js` (navegador, RLS) y `src/lib/supabase.server.js` (sesión por cookies + service role).
- Auth de servidor: `src/lib/auth-middleware.js` (`requireUser`, `requireSuperAdmin`, TOTP opcional con `REQUIRE_ADMIN_MFA`).
- Server functions reescritas: `booking`, `billing`, `merchant`, `superadmin` (+ `saveTenantSettings` y `saveIntegration` nuevas).
- Servidor: `appointments.server`, `automations.server`, `whatsapp.server`, `mp-signature.server`, `safe-url.server`.
- Rutas API: `mp-webhook`, `mp-suscripciones`, `cron-reminders` (con CRON_SECRET).
- Renombrados (el export los había alterado): `__root.jsx`, `useMerchant.js`, `eslint.config.js`, `ui/accordion.jsx`.

## Hecho — paso 3: autenticación con Supabase Auth
- `src/lib/AuthContext.jsx` (sesión en el navegador; `user.role === "admin"` = super admin, igual que antes) y `src/lib/auth.client.js`.
- Pantallas en español: login (email + contraseña y Google), registro con código de 6 dígitos por email,
  recuperar contraseña, elegir contraseña (también para la invitación del comercio), `/auth/confirm` (links de email y Google).
- `/mfa`: TOTP solo para el super admin (QR la primera vez, luego código). `AuthGate` lo obliga antes de entrar a `/admin`.
- Eliminados los archivos de MFA/consentimiento de Base44.

### Configuración que hay que hacer en el panel de Supabase
1. **Authentication > URL Configuration**: Site URL = tu dominio de Vercel; Redirect URLs = `http://localhost:3000/**` y `https://TU-DOMINIO/**`.
2. **Authentication > Email Templates**:
   - *Confirm signup*: mostrar el código `{{ .Token }}` (no el link).
   - *Invite user* y *Reset password*: el botón/link debe ser `{{ .RedirectTo }}&token_hash={{ .TokenHash }}`.
3. **Authentication > Sign In / Providers**: Email con "Confirm email" activado y largo mínimo de contraseña 8.
   Google: Client ID y Secret de Google Cloud; en Google autorizar `https://TU-PROYECTO.supabase.co/auth/v1/callback`.
4. **Authentication > Multi-Factor**: TOTP habilitado.
5. **SMTP propio** (Resend, Brevo, etc.) antes de salir a producción: el correo integrado de Supabase tiene un límite muy bajo y no sirve para clientes reales.
6. Cuando el TOTP de tu cuenta funcione: `REQUIRE_ADMIN_MFA=true` en Vercel (el servidor deja de aceptar al super admin sin TOTP).
7. Si el super admin pierde su app de autenticación: Authentication > Users > su usuario > borrar el factor, y vuelve a enrolar.

## Hecho — paso 4: pantallas del panel y del admin sobre Supabase
- `panel/index`, `servicios`, `horarios`, `abono` y `admin` leen y escriben con `getSupabase()` (RLS en la base). Los errores
  de la base se muestran como aviso (`src/lib/db.client.js`).
- `panel/integraciones` usa `saveTenantSettings` y `saveIntegration`: los tokens son de solo escritura
  (campo vacío = no cambiar; hay botones "Desconectar" y "Quitar token"); el token de MP se valida contra Mercado Pago al guardar.
- Agenda: ahora trae los turnos del mes en curso en adelante (antes traía los 200 más viejos).
- Ya no queda ninguna referencia a Base44 en `src/`.

## Hecho — paso 5: despliegue
- Guía completa en `DEPLOY.md` (GitHub, Vercel, variables, Supabase, webhooks de Mercado Pago, cron, prueba end-to-end, checklist de producción).
- `supabase/migrations/003_cron_programado.sql`: expiración de turnos cada minuto y recordatorios cada 15 minutos desde pg_cron/pg_net.
- Ajuste: el webhook del abono acepta los dos nombres del evento de suscripción y la firma se registra sin rechazar hasta activar `MP_WEBHOOK_STRICT=true`.

## Primer arranque (qué esperar)
- `src/routeTree.gen.ts` no está en el zip: lo genera TanStack Router la primera vez que corrés `npm run dev` o `npm run build`.
- Revisado sin ejecutar: sintaxis de los 125 archivos JS/JSX, imports resueltos (respetando mayúsculas) y nombres no definidos.
  No se compiló ni se probó contra Supabase: los primeros errores reales aparecerán en `npm run dev`.
