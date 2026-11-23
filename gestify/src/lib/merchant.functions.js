import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { platformToken } from "@/lib/billing.server";
import { getMpUser } from "@/lib/mercadopago.server";
import { assertSafeWebhookUrl } from "@/lib/safe-url.server";
import { toWhatsAppNumber } from "@/lib/phone";
import { checkSlug } from "@/lib/slugs";
import { dbFail, supabaseAdmin, unwrap } from "@/lib/supabase.server";

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

// Período de prueba del autoregistro y precio inicial del abono (lo puede cambiar el super admin después).
const trialDays = () => Math.min(Math.max(Number(process.env.TRIAL_DAYS) || 14, 1), 90);
const defaultMonthlyPrice = () => Math.max(Number(process.env.DEFAULT_MONTHLY_PRICE) || 0, 0);

/**
 * Autoregistro: un usuario con email confirmado y sin comercio crea el suyo, con período de prueba.
 * El dueño sale de la sesión (nunca del navegador) y se permite un solo comercio por usuario.
 */
export const createOwnTenant = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      nombre_comercio: z.string().trim().min(2, "Ingresá el nombre del local").max(120),
      rubro: z.string().trim().min(2, "Elegí el rubro").max(60),
      slug: z.string().trim().max(60).optional(),
      telefono_whatsapp: z.string().trim().max(40).optional(),
      direccion: z.string().trim().max(200).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { user, profile } = context;
    if (profile?.tipo_usuario === "super_admin") throw new Error("El administrador de la plataforma no tiene comercio propio.");
    if (!user.email_confirmed_at) throw new Error("Confirmá tu email antes de crear tu comercio.");

    const db = supabaseAdmin();
    const existing = unwrap(await db.from("tenants").select("id").eq("owner_id", user.id).limit(1).maybeSingle());
    if (existing || profile?.tenant_id) throw new Error("Tu cuenta ya tiene un comercio. Recargá la página.");

    const { slug, error: slugError } = checkSlug(data.slug || data.nombre_comercio);
    if (slugError) throw new Error(slugError);

    let telefono = "";
    if (data.telefono_whatsapp) {
      telefono = toWhatsAppNumber(data.telefono_whatsapp);
      if (!telefono) throw new Error("Revisá el WhatsApp del local: con código de área, por ejemplo 11 5555 5555.");
    }

    const inserted = await db
      .from("tenants")
      .insert({
        slug,
        nombre_comercio: data.nombre_comercio,
        rubro: data.rubro,
        direccion: data.direccion || "",
        telefono_whatsapp: telefono,
        politica_sena: "La seña no es reembolsable si cancelás con menos de 24 horas de anticipación.",
        horas_aviso_previo: 24,
        owner_id: user.id,
        owner_email: user.email,
        activo: true,
        notas: `Autoregistro de ${user.email} (prueba de ${trialDays()} días)`,
      })
      .select("*")
      .single();
    if (inserted.error) {
      if (inserted.error.code === "23505") throw new Error(`La dirección "${slug}" ya está en uso. Probá con otra (por ejemplo ${slug}-centro).`);
      if (inserted.error.code === "23514") throw new Error("Esa dirección no está permitida. Probá con otra.");
      throw dbFail(inserted.error, "No pudimos crear tu comercio. Probá de nuevo.");
    }
    const tenant = inserted.data;

    try {
      unwrap(
        await db.from("tenant_subscriptions").insert({
          tenant_id: tenant.id,
          precio_mensual: defaultMonthlyPrice(),
          estado_suscripcion: "activa",
          fecha_vencimiento_actual: new Date(Date.now() + trialDays() * 86400000).toISOString(),
        }),
      );
      unwrap(await db.from("tenant_integrations").insert({ tenant_id: tenant.id, whatsapp_activo: true }));
      unwrap(
        await db.from("schedules").insert([
          ...[1, 2, 3, 4, 5].map((dia) => ({ tenant_id: tenant.id, dia_semana: dia, hora_inicio: "09:00", hora_fin: "18:00", activo: true })),
          { tenant_id: tenant.id, dia_semana: 6, hora_inicio: "09:00", hora_fin: "13:00", activo: true },
        ]),
      );
      unwrap(await db.from("profiles").update({ tenant_id: tenant.id, tipo_usuario: "comerciante" }).eq("id", user.id));
    } catch (error) {
      // alta a medias: se deshace (las tablas hijas se borran en cascada)
      await db.from("tenants").delete().eq("id", tenant.id);
      throw dbFail(error?.cause || error, "No pudimos crear tu comercio. Probá de nuevo.");
    }

    return { ok: true, slug: tenant.slug, dias_prueba: trialDays() };
  });
