# Gestify Turnos

SaaS de turnos multi-rubro: reserva pública con seña por Mercado Pago, panel de comercio, panel de super admin
y cobro del abono mensual por débito automático de Mercado Pago.

**Stack:** TanStack Start (React 19) · Supabase (Postgres + Auth) · Vercel (Nitro) · Tailwind + shadcn/ui.

## Puesta en marcha

```bash
npm ci                 # instala exactamente lo de package-lock.json
cp .env.example .env   # y completá los valores (APP_URL local: http://localhost:3000)
npm run dev            # http://localhost:3000
npm test               # tests (Vitest); npm run test:watch mientras programás
npm run lint && npm run build   # antes de cada deploy (GitHub Actions lo corre en cada PR)
```

1. Supabase > SQL Editor: correr en orden `supabase/migrations/001_...sql`, `002_...`, `003_...`, `004_...` y `005_...`.
2. Registrarte y volverte super admin: `update public.profiles set tipo_usuario = 'super_admin' where email = 'TU_EMAIL';`
3. Cargar las variables de `.env.example` en Vercel (Settings > Environment Variables) y desplegar desde GitHub.

Despliegue paso a paso: `DEPLOY.md`. Estado de la migración: `MIGRATION.md`.
