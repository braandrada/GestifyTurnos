# Estado de la migración Base44 → Supabase + Vercel

## Hecho (pasos 1 y 2)
- Config: `vite.config.js` (TanStack Start + Nitro), `package.json` sin dependencias de Base44/Cloudflare, `.env.example`.
- Supabase: `src/lib/supabase.client.js` (navegador, RLS) y `src/lib/supabase.server.js` (sesión por cookies + service role).
- Auth de servidor: `src/lib/auth-middleware.js` (`requireUser`, `requireSuperAdmin`, TOTP opcional con `REQUIRE_ADMIN_MFA`).
- Server functions reescritas: `booking`, `billing`, `merchant`, `superadmin` (+ `saveTenantSettings` y `saveIntegration` nuevas).
- Servidor: `appointments.server`, `automations.server`, `whatsapp.server`, `mp-signature.server`, `safe-url.server`.
- Rutas API: `mp-webhook`, `mp-suscripciones`, `cron-reminders` (con CRON_SECRET).
- Renombrados (el export los había alterado): `__root.jsx`, `useMerchant.js`, `eslint.config.js`, `ui/accordion.jsx`.

## Pendiente — paso 3: autenticación (usa `@/api/base44Client`, ya no existe)
- `src/lib/AuthContext.jsx` → sesión con `getSupabase().auth` (getSession / onAuthStateChange).
- `src/components/auth/*`: LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage, AuthGate.
- Google (OAuth) y recuperación de contraseña con Supabase Auth.
- TOTP solo para super admin (`supabase.auth.mfa.enroll/challenge/verify`); activar `REQUIRE_ADMIN_MFA=true` al terminar.
- Eliminar: `lib/authMfa.js`, `lib/authMfaFlow.js`, `components/auth/Mfa*`, `ConsentPage`, `UserNotRegistered` (propios de Base44).
- Página para aceptar la invitación del comercio (link de `inviteUserByEmail`).

## Pendiente — paso 4: pantallas que leen/escriben datos desde el navegador
- `routes/_authed/panel/{index,servicios,horarios,abono}.jsx` y `routes/_authed/admin.jsx`:
  cambiar `base44.entities.X` por `getSupabase().from("tabla")...` (RLS ya está en la base).
  Nombres: Appointment→appointments, Service→services, Schedule→schedules, SubscriptionPayment→subscription_payments,
  Tenant→tenants, TenantSubscription→tenant_subscriptions. `created_date`→`created_at`. Las listas ya no vienen en `.items`.
- `panel/integraciones.jsx`: usar `saveTenantSettings` y `saveIntegration`. El token ya NO se envía al navegador:
  `merchant.integration` trae `{ mp_conectado, whatsapp_api_url, whatsapp_token_configurado, whatsapp_activo }`.
- Los horarios de `schedules` vuelven como `"09:00:00"` (tipo `time`); mostrar con `.slice(0, 5)`.

## Paso 5: despliegue
- Vercel: importar el repo de GitHub (detecta TanStack Start) y cargar las variables de `.env.example`.
- Mercado Pago: en tu aplicación, URL de webhooks de la plataforma = `https://TU-DOMINIO/api/mp-suscripciones`
  (eventos: suscripciones y pagos de suscripciones) y copiar la "clave secreta" a `MP_WEBHOOK_SECRET`.
- Cron: `/api/cron-reminders` con `Authorization: Bearer <CRON_SECRET>` (recordatorios); expiración de turnos con pg_cron (ver 002).
