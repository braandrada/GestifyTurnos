import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { appOrigin } from "@/lib/app-url.server";
import { requireSuperAdmin } from "@/lib/auth-middleware";
import { runAutomations } from "@/lib/automations.server";
import { slugify } from "@/lib/format";
import { dbFail, supabaseAdmin, unwrap } from "@/lib/supabase.server";

// Coinciden con rutas de la app; misma lista que la constraint tenants_slug_reservado (migración 004).
const RESERVED_SLUGS = new Set([
  "admin", "panel", "login", "register", "mfa", "api", "pago", "auth",
  "forgot-password", "reset-password", "www", "app", "assets", "static",
]);

export const provisionTenant = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator(
    z.object({
      email: z.string().email(),
      nombre_comercio: z.string().min(2).max(120),
      rubro: z.string().min(2).max(60),
      slug: z.string().min(2).max(40).optional(),
      direccion: z.string().max(200).optional(),
      telefono_whatsapp: z.string().max(40).optional(),
      precio_mensual: z.coerce.number().min(0).max(10000000).optional(),
      fecha_vencimiento: z.string().min(8).max(40),
      politica_sena: z.string().max(600).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = supabaseAdmin();
    const email = data.email.trim().toLowerCase();
    const slug = slugify(data.slug || data.nombre_comercio);
    if (!slug) throw new Error("El slug no es válido");
    if (RESERVED_SLUGS.has(slug)) throw new Error(`"${slug}" es una dirección reservada de la plataforma. Elegí otro slug.`);

    const taken = unwrap(await db.from("tenants").select("id").eq("slug", slug).maybeSingle());
    if (taken) throw new Error("Ese slug ya está en uso, elegí otro");

    const vencimiento = new Date(data.fecha_vencimiento);
    if (Number.isNaN(vencimiento.getTime())) throw new Error("La fecha de vencimiento no es válida");

    // Invitación por email (el dueño define su contraseña desde el link). Si ya existe, se vincula por email al ingresar.
    let invite = { invitado: true };
    let ownerId = null;
    const invited = await db.auth.admin.inviteUserByEmail(email, { redirectTo: `${appOrigin()}/auth/confirm?type=invite` });
    if (invited.error) invite = { invitado: false, motivo: invited.error.message || "El usuario ya existe" };
    else ownerId = invited.data?.user?.id ?? null;

    const tenant = unwrap(
      await db
        .from("tenants")
        .insert({
          slug,
          nombre_comercio: data.nombre_comercio.trim(),
          rubro: data.rubro.trim(),
          direccion: data.direccion?.trim() || "",
          telefono_whatsapp: data.telefono_whatsapp?.trim() || "",
          politica_sena:
            data.politica_sena?.trim() || "La seña no es reembolsable si cancelás con menos de 24 horas de anticipación.",
          horas_aviso_previo: 24,
          owner_email: email,
          owner_id: ownerId,
          activo: true,
          notas: `Alta por ${context.user.email}`,
        })
        .select("*")
        .single(),
    );

    try {
      unwrap(
        await db.from("tenant_subscriptions").insert({
          tenant_id: tenant.id,
          precio_mensual: Number(data.precio_mensual) || 0,
          estado_suscripcion: "activa",
          fecha_vencimiento_actual: vencimiento.toISOString(),
        }),
      );
      unwrap(await db.from("tenant_integrations").insert({ tenant_id: tenant.id, whatsapp_activo: true }));
      unwrap(
        await db.from("schedules").insert([
          ...[1, 2, 3, 4, 5].map((dia) => ({ tenant_id: tenant.id, dia_semana: dia, hora_inicio: "09:00", hora_fin: "18:00", activo: true })),
          { tenant_id: tenant.id, dia_semana: 6, hora_inicio: "09:00", hora_fin: "13:00", activo: true },
        ]),
      );
      if (ownerId) {
        unwrap(await db.from("profiles").update({ tenant_id: tenant.id, tipo_usuario: "comerciante" }).eq("id", ownerId));
      }
    } catch (error) {
      // alta a medias: se deshace el comercio (las tablas hijas se borran en cascada)
      await db.from("tenants").delete().eq("id", tenant.id);
      throw dbFail(error?.cause || error, "No pudimos completar el alta del comercio. No se guardó nada, probá de nuevo.");
    }

    return { tenant, invite };
  });

export const registerSubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator(
    z.object({
      tenant_id: z.string().uuid(),
      monto: z.coerce.number().min(0),
      metodo_pago: z.enum(["transferencia", "efectivo", "mercadopago", "otro"]),
      periodo_cubierto: z.string().max(20).optional(),
      notas: z.string().max(400).optional(),
      nueva_fecha_vencimiento: z.string().min(8).max(40),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = supabaseAdmin();
    const tenant = unwrap(await db.from("tenants").select("id, nombre_comercio").eq("id", data.tenant_id).maybeSingle());
    if (!tenant) throw new Error("No encontramos el comercio");

    const vencimiento = new Date(data.nueva_fecha_vencimiento);
    if (Number.isNaN(vencimiento.getTime())) throw new Error("La fecha de vencimiento no es válida");

    unwrap(
      await db.from("subscription_payments").insert({
        tenant_id: data.tenant_id,
        tenant_nombre: tenant.nombre_comercio,
        monto: Number(data.monto),
        metodo_pago: data.metodo_pago,
        periodo_cubierto: data.periodo_cubierto || new Date().toISOString().slice(0, 7),
        fecha_pago: new Date().toISOString(),
        notas: data.notas || "",
        registrado_por: context.user.email,
      }),
    );

    const subscription = unwrap(
      await db.from("tenant_subscriptions").select("id, precio_mensual").eq("tenant_id", data.tenant_id).maybeSingle(),
    );
    if (subscription) {
      unwrap(
        await db
          .from("tenant_subscriptions")
          .update({
            estado_suscripcion: "activa",
            fecha_vencimiento_actual: vencimiento.toISOString(),
            precio_mensual: Number(data.monto) > 0 ? Number(data.monto) : subscription.precio_mensual,
          })
          .eq("id", subscription.id),
      );
    } else {
      unwrap(
        await db.from("tenant_subscriptions").insert({
          tenant_id: data.tenant_id,
          precio_mensual: Number(data.monto),
          estado_suscripcion: "activa",
          fecha_vencimiento_actual: vencimiento.toISOString(),
        }),
      );
    }

    return { ok: true, fecha_vencimiento_actual: vencimiento.toISOString() };
  });

export const setSubscriptionState = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .validator(
    z.object({
      tenant_id: z.string().uuid(),
      estado_suscripcion: z.enum(["activa", "vencida", "suspendida"]),
    }),
  )
  .handler(async ({ data }) => {
    const updated = unwrap(
      await supabaseAdmin()
        .from("tenant_subscriptions")
        .update({ estado_suscripcion: data.estado_suscripcion })
        .eq("tenant_id", data.tenant_id)
        .select("id")
        .maybeSingle(),
    );
    if (!updated) throw new Error("El comercio no tiene suscripción registrada");
    return { ok: true };
  });

export const runPlatformAutomations = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .handler(async () => runAutomations());
