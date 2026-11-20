import { createFileRoute } from "@tanstack/react-router";
import { runAutomations } from "@/lib/automations.server";
import { safeEqual } from "@/lib/crypto.server";

// Tareas programadas: expira turnos impagos, marca abonos vencidos y envía recordatorios por WhatsApp.
// Protegido: hay que enviar `Authorization: Bearer <CRON_SECRET>` (Vercel Cron lo manda solo si definís CRON_SECRET).
async function handle(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET no está configurado" }, { status: 503 });

  const provided = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(provided, secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const summary = await runAutomations();
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[cron-reminders]", error?.message);
    return Response.json({ ok: false }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
