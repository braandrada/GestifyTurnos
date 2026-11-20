import { createFileRoute } from "@tanstack/react-router";
import { confirmAppointment } from "@/lib/appointments.server";
import { getPayment } from "@/lib/mercadopago.server";
import { supabaseAdmin } from "@/lib/supabase.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Webhook de señas: Mercado Pago avisa el pago y el turno pasa a confirmado.
 *
 * Este aviso va a la cuenta de CADA comercio, así que la plataforma no tiene su clave de firma.
 * Por eso nunca se confía en el contenido del aviso: se vuelve a pedir el pago a Mercado Pago con el
 * token del comercio y se comprueba que el turno sea de ese comercio y que el monto cubra la seña.
 * Responde 200 a lo que no corresponde (para que MP no reintente) y 500 si falla algo transitorio.
 */
export const Route = createFileRoute("/api/mp-webhook")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true }),
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const tenantId = url.searchParams.get("tenant");
          const body = await request.json().catch(() => ({}));
          const paymentId = url.searchParams.get("data.id") || body?.data?.id;
          const type = body?.type || url.searchParams.get("type") || url.searchParams.get("topic");

          if (!tenantId || !UUID.test(tenantId) || !paymentId || (type && type !== "payment")) {
            return Response.json({ ok: true, ignored: true });
          }

          const db = supabaseAdmin();
          const { data: integration, error: integrationError } = await db
            .from("tenant_integrations")
            .select("mp_access_token")
            .eq("tenant_id", tenantId)
            .maybeSingle();
          if (integrationError) throw integrationError;
          if (!integration?.mp_access_token) return Response.json({ ok: true, ignored: "sin_token" });

          const payment = await getPayment({ accessToken: integration.mp_access_token, paymentId });
          if (!payment || payment.status !== "approved") return Response.json({ ok: true, ignored: "sin_pago" });

          const appointmentId = payment.external_reference;
          if (!appointmentId || !UUID.test(appointmentId)) return Response.json({ ok: true, ignored: "sin_referencia" });

          const { data: appointment, error: appointmentError } = await db
            .from("appointments")
            .select("*")
            .eq("id", appointmentId)
            .maybeSingle();
          if (appointmentError) throw appointmentError;
          if (!appointment) return Response.json({ ok: true, ignored: "sin_turno" });

          // El turno tiene que ser del comercio cuyo token consultó el pago (evita confirmar turnos ajenos).
          if (appointment.tenant_id !== tenantId) return Response.json({ ok: true, ignored: "otro_comercio" });

          // La seña pagada debe cubrir el monto acordado.
          if (Number(payment.transaction_amount) + 0.001 < Number(appointment.monto_sena)) {
            return Response.json({ ok: true, ignored: "monto_insuficiente" });
          }

          const result = await confirmAppointment({ appointment, paymentId: payment.id });
          return Response.json({ ok: true, confirmado: result.confirmed, conflicto: result.conflict || false });
        } catch (error) {
          console.error("[mp-webhook]", error?.message);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
