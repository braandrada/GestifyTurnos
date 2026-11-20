import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { appOrigin } from "@/lib/app-url.server";
import { requireUser } from "@/lib/auth-middleware";
import { platformToken } from "@/lib/billing.server";
import { cancelPreapproval, createPreapproval, getPreapproval } from "@/lib/mercadopago.server";
import { supabaseAdmin, unwrap } from "@/lib/supabase.server";

// Comercio + abono del usuario que llama (el tenant sale de su perfil, nunca de lo que mande el navegador).
async function resolveMerchant(context) {
  const tenantId = context.profile?.tenant_id;
  if (!tenantId) throw new Error("Tu usuario no tiene un comercio asociado");

  const db = supabaseAdmin();
  const tenant = unwrap(await db.from("tenants").select("*").eq("id", tenantId).maybeSingle());
  if (!tenant) throw new Error("Tu usuario no tiene un comercio asociado");

  const subscription = unwrap(await db.from("tenant_subscriptions").select("*").eq("tenant_id", tenant.id).maybeSingle());
  if (!subscription) throw new Error("El comercio todavía no tiene un abono registrado");
  return { db, tenant, subscription };
}

/** Genera el link de Mercado Pago para autorizar el débito automático del abono. */
export const createSubscriptionPreapproval = createServerFn({ method: "POST" })
  .middleware([requireUser])
  // `origin` se acepta por compatibilidad pero se ignora: la URL de retorno sale de APP_URL.
  .validator(z.object({ origin: z.string().max(300).optional() }).optional())
  .handler(async ({ context }) => {
    const accessToken = platformToken();
    if (!accessToken) throw new Error("La plataforma todavía no configuró su cuenta de Mercado Pago");

    const { db, tenant, subscription } = await resolveMerchant(context);
    if (!(Number(subscription.precio_mensual) > 0)) {
      throw new Error("La plataforma todavía no fijó el precio de tu abono");
    }

    const preapproval = await createPreapproval({ accessToken, tenant, subscription, origin: appOrigin() });

    unwrap(
      await db
        .from("tenant_subscriptions")
        .update({
          mp_preapproval_id: preapproval.id,
          mp_estado: preapproval.status,
          mp_iniciada_en: new Date().toISOString(),
        })
        .eq("id", subscription.id),
    );

    return { init_point: preapproval.init_point, mp_estado: preapproval.status };
  });

/** Consulta el estado real de la suscripción (al volver de Mercado Pago o al abrir el panel). */
export const syncSubscriptionPreapproval = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const accessToken = platformToken();
    const { db, subscription } = await resolveMerchant(context);
    if (!accessToken || !subscription.mp_preapproval_id) return { mp_estado: subscription.mp_estado || null };

    const preapproval = await getPreapproval({ accessToken, preapprovalId: subscription.mp_preapproval_id });
    if (!preapproval) return { mp_estado: subscription.mp_estado || null };

    const patch = { mp_estado: preapproval.status || "pending" };
    if (preapproval.status === "authorized") patch.estado_suscripcion = "activa";
    unwrap(await db.from("tenant_subscriptions").update(patch).eq("id", subscription.id));
    return { mp_estado: patch.mp_estado };
  });

/** Corta el débito automático en Mercado Pago. */
export const cancelSubscriptionPreapproval = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const accessToken = platformToken();
    const { db, subscription } = await resolveMerchant(context);
    if (!subscription.mp_preapproval_id) return { ok: true };

    if (accessToken) {
      await cancelPreapproval({ accessToken, preapprovalId: subscription.mp_preapproval_id }).catch(() => null);
    }
    unwrap(await db.from("tenant_subscriptions").update({ mp_estado: "cancelled" }).eq("id", subscription.id));
    return { ok: true };
  });
