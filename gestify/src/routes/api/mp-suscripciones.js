import { createFileRoute } from "@tanstack/react-router";
import { addOneMonth } from "@/lib/billing-dates";
import { platformToken } from "@/lib/billing.server";
import { getAuthorizedPayment, getPreapproval } from "@/lib/mercadopago.server";
import { verifyMpSignature } from "@/lib/mp-signature.server";
import { supabaseAdmin } from "@/lib/supabase.server";


/**
 * Webhook del abono mensual: Mercado Pago avisa la autorización del débito y cada cobro.
 * Se valida la firma (MP_WEBHOOK_SECRET) y además todo se vuelve a consultar a la API de MP.
 */
export const Route = createFileRoute("/api/mp-suscripciones")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true }),
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const body = await request.json().catch(() => ({}));
          const type = body?.type || url.searchParams.get("type");
          const id = url.searchParams.get("data.id") || body?.data?.id;
          const accessToken = platformToken();

          if (!accessToken || !type || !id) return Response.json({ ok: true, ignored: true });

          // Firma: por defecto solo se registra si no coincide (todo se vuelve a consultar a MP, así que un aviso
          // falso no puede modificar nada). Con MP_WEBHOOK_STRICT=true se rechaza. Activalo cuando los logs
          // muestren que los avisos reales de Mercado Pago llegan con firma válida.
          const webhookSecret = process.env.MP_WEBHOOK_SECRET;
          if (webhookSecret) {
            if (!verifyMpSignature({ request, dataId: id, secret: webhookSecret })) {
              console.warn("[mp-suscripciones] firma x-signature inválida o ausente (data.id=%s)", id);
              if (process.env.MP_WEBHOOK_STRICT === "true") {
                return Response.json({ error: "firma inválida" }, { status: 401 });
              }
            }
          } else {
            console.warn("[mp-suscripciones] MP_WEBHOOK_SECRET no está configurada: no se valida la firma.");
          }

          const db = supabaseAdmin();

          // Según el canal, Mercado Pago nombra el evento "preapproval" o "subscription_preapproval".
          if (type === "preapproval" || type === "subscription_preapproval") {
            const preapproval = await getPreapproval({ accessToken, preapprovalId: id });
            if (!preapproval) return Response.json({ ok: true, ignored: "sin_preapproval" });

            // Autorizar el débito no es pagar: estado_suscripcion lo cambia el cobro aprobado (más abajo).
            const patch = { mp_estado: preapproval.status || "pending" };
            const { data, error } = await db
              .from("tenant_subscriptions")
              .update(patch)
              .eq("mp_preapproval_id", String(preapproval.id))
              .select("id")
              .maybeSingle();
            if (error) throw error;
            if (!data) return Response.json({ ok: true, ignored: "sin_abono" });
            return Response.json({ ok: true, preapproval: patch.mp_estado });
          }

          if (type === "subscription_authorized_payment" || type === "authorized_payment") {
            const invoice = await getAuthorizedPayment({ accessToken, paymentId: id });
            if (!invoice) return Response.json({ ok: true, ignored: "sin_cobro" });

            const { data: subscription, error: subscriptionError } = await db
              .from("tenant_subscriptions")
              .select("*")
              .eq("mp_preapproval_id", String(invoice.preapproval_id))
              .maybeSingle();
            if (subscriptionError) throw subscriptionError;
            if (!subscription) return Response.json({ ok: true, ignored: "sin_abono" });

            // En una factura de Mercado Pago, `status` es del intento de cobro (scheduled / processed / recycling /
            // canceled); el resultado real del pago está en `payment.status`.
            const paymentStatus = invoice.payment?.status || null;
            if (paymentStatus !== "approved") {
              if (paymentStatus) {
                await db.from("tenant_subscriptions").update({ mp_estado: paymentStatus }).eq("id", subscription.id);
              }
              return Response.json({ ok: true, cobro: paymentStatus || invoice.status });
            }

            const mpPaymentId = String(invoice.payment?.id || invoice.id);
            const vencimiento = addOneMonth(subscription.fecha_vencimiento_actual);
            const monto = Number(invoice.transaction_amount) || Number(subscription.precio_mensual) || 0;

            const { data: tenant } = await db.from("tenants").select("nombre_comercio").eq("id", subscription.tenant_id).maybeSingle();

            // El índice único sobre mp_payment_id hace de candado: si el aviso llega dos veces, la segunda no inserta.
            const { error: insertError } = await db.from("subscription_payments").insert({
              tenant_id: subscription.tenant_id,
              tenant_nombre: tenant?.nombre_comercio || "",
              monto,
              metodo_pago: "mercadopago",
              periodo_cubierto: vencimiento.slice(0, 7),
              fecha_pago: new Date().toISOString(),
              notas: "Cobro automático del abono",
              registrado_por: "Mercado Pago",
              mp_payment_id: mpPaymentId,
            });
            if (insertError) {
              if (insertError.code === "23505") return Response.json({ ok: true, duplicado: true });
              throw insertError;
            }

            const { error: updateError } = await db
              .from("tenant_subscriptions")
              .update({
                estado_suscripcion: "activa",
                fecha_vencimiento_actual: vencimiento,
                mp_estado: "authorized",
                mp_ultimo_pago: new Date().toISOString(),
                precio_mensual: monto > 0 ? monto : subscription.precio_mensual,
              })
              .eq("id", subscription.id);
            if (updateError) throw updateError;

            return Response.json({ ok: true, cobrado: monto, vencimiento });
          }

          return Response.json({ ok: true, ignored: type });
        } catch (error) {
          console.error("[mp-suscripciones]", error?.message);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
