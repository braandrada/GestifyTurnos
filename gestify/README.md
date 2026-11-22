# Gestify Turnos

SaaS de turnos multi-rubro: reserva pública con seña por Mercado Pago, panel de comercio, panel de super admin
y cobro del abono mensual por débito automático de Mercado Pago.

**Stack:** TanStack Start (React 19) · Supabase (Postgres + Auth) · Vercel (Nitro) · Tailwind + shadcn/ui.

## Puesta en marcha

```bash
npm install
npm install nitro @supabase/supabase-js @supabase/ssr   # fija las versiones actuales
cp .env.example .env                                      # y completá los valores
npm run dev                                               # http://localhost:3000
```

1. Supabase > SQL Editor: correr `supabase/migrations/001_...sql` y después `002_...sql`.
2. Registrarte y volverte super admin: `update public.profiles set tipo_usuario = 'super_admin' where email = 'TU_EMAIL';`
3. Cargar las variables de `.env.example` en Vercel (Settings > Environment Variables) y desplegar desde GitHub.

Despliegue paso a paso: `DEPLOY.md`. Estado de la migración: `MIGRATION.md`.
