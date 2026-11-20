import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { runAutomations } from "@/lib/automations.server";
import { platformToken } from "@/lib/billing.server";
import { getMpUser } from "@/lib/mercadopago.server";
import { assertSafeWebhookUrl } from "@/lib/safe-url.server";
import { supabaseAdmin, unwrap } from "@/lib/supabase.server";

// Lo que el navegador puede saber de las integraciones: NUNCA los tokens, solo si están cargados.
function integrationStatus(row) {
  if (!row) return null;
  return {
    mp_conectado: Boolean(row.mp_access_token),
    whatsapp_api_url: row.whatsapp_api_url || "",
    whatsapp_token_configurado: Boolean(row.whatsapp_token),
    whatsapp_activo: row.whatsapp_activo !== false,
  };
}

// Las notas internas las escribe y lee solo el super admin.
function publicTenantRow(tenant) {
  const { notas: _notas, ...rest } = tenant;
  return rest;
}

async function currentTenant(context) {
  const tenantId = context.profile?.tenant_id;
  if (!tenantId) throw new Error("Tu usuario no tiene un comercio asociado");
  const tenant = unwrap(await supabaseAdmin().from("tenants").select("*").eq("id", tenantId).maybeSingle());
  if (!tenant) throw new Error("Tu usuario no tiene un comercio asociado");
  return tenant;
}

/**
 * Resuelve el comercio del usuario logueado y fija su tenant_id en el perfil
 * (campo bloqueado para el navegador: solo el servidor puede asignarlo).
 *
 * Un comercio se vincula a su dueño por owner_id (alta del super admin) o, la primera vez,
 * por email: SOLO si el email de la cuenta está verificado y el comercio no tiene dueño todavía.
 */
export const ensureMerchantAccess = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const { user, profile } = context;
    const db = supabaseAdmin();

    if (profile?.tipo_usuario === "super_admin") {
      return { role: "super_admin", tenant: null, subscription: null, integration: null };
    }

    let tenant = unwrap(await db.from("tenants").select("*").eq("owner_id", user.id).maybeSingle());

    if (!tenant && user.email_confirmed_at) {
      const candidate = unwrap(
        await db
          .from("tenants")
          .select("id")
          .eq("owner_email", user.email)
          .is("owner_id", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      );
      if (candidate) {
        tenant = unwrap(
          await db
            .from("tenants")
            .update({ owner_id: user.id })
            .eq("id", candidate.id)
            .is("owner_id", null)
            .select("*")
            .maybeSingle(),
        );
      }
    }

    if (!tenant) return { role: "sin_comercio", tenant: null, subscription: null, integration: null };

    if (profile?.tenant_id !== tenant.id || profile?.tipo_usuario !== "comerciante") {
      unwrap(await db.from("profiles").update({ tenant_id: tenant.id, tipo_usuario: "comerciante" }).eq("id", user.id));
    }

    const [subscription, integration] = await Promise.all([
      db.from("tenant_subscriptions").select("*").eq("tenant_id", tenant.id).maybeSingle(),
      db.from("tenant_integrations").select("*").eq("tenant_id", tenant.id).maybeSingle(),
    ]);

    return {
      role: "comerciante",
      tenant: publicTenantRow(tenant),
      subscription: unwrap(subscription) || null,
      integration: integrationStatus(unwrap(integration)),
      billingReady: Boolean(platformToken()),
    };
  });

/** Datos del comercio que el dueño puede editar (no puede tocar activo, dueño ni slug). */
export const saveTenantSettings = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      nombre_comercio: z.string().trim().min(2).max(120),
      rubro: z.string().trim().max(60).optional(),
      direccion: z.string().trim().max(200).optional(),
      telefono_whatsapp: z.string().trim().max(40).optional(),
      politica_sena: z.string().trim().max(600).optional(),
      horas_aviso_previo: z.coerce.number().int().min(1).max(168),
    }),
  )
  .handler(async ({ data, context }) => {
    const tenant = await currentTenant(context);
    unwrap(await supabaseAdmin().from("tenants").update(data).eq("id", tenant.id));
    return { ok: true };
  });

/**
 * Guarda token de Mercado Pago y datos de WhatsApp del comercio.
 * Los secretos son de solo escritura: campo vacío = no cambiar; quitar_* = borrar.
 */
export const saveIntegration = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      mp_access_token: z.string().trim().max(500).optional(),
      quitar_mp_token: z.boolean().optional(),
      whatsapp_api_url: z.string().trim().max(500).optional(),
      whatsapp_token: z.string().trim().max(500).optional(),
      quitar_whatsapp_token: z.boolean().optional(),
      whatsapp_activo: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const tenant = await currentTenant(context);
    const patch = {};

    if (data.quitar_mp_token) patch.mp_access_token = null;
    else if (data.mp_access_token) {
      const mpUser = await getMpUser({ accessToken: data.mp_access_token });
      if (!mpUser) throw new Error("Mercado Pago no aceptó ese access token. Revisá que sea el de producción.");
      patch.mp_access_token = data.mp_access_token;
    }

    if (data.whatsapp_api_url !== undefined) {
      patch.whatsapp_api_url = data.whatsapp_api_url ? assertSafeWebhookUrl(data.whatsapp_api_url) : null;
    }
    if (data.quitar_whatsapp_token) patch.whatsapp_token = null;
    else if (data.whatsapp_token) patch.whatsapp_token = data.whatsapp_token;
    if (data.whatsapp_activo !== undefined) patch.whatsapp_activo = data.whatsapp_activo;

    if (!Object.keys(patch).length) return { ok: true, integration: null };

    const saved = unwrap(
      await supabaseAdmin()
        .from("tenant_integrations")
        .upsert({ tenant_id: tenant.id, ...patch }, { onConflict: "tenant_id" })
        .select("*")
        .single(),
    );
    return { ok: true, integration: integrationStatus(saved) };
  });

export const runMyAutomations = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => runAutomations());
