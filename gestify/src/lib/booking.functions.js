import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { appOrigin } from "@/lib/app-url.server";
import { confirmAppointment } from "@/lib/appointments.server";
import { formatDateTime } from "@/lib/format";
import { createPreference, findApprovedPayment } from "@/lib/mercadopago.server";
import { toWhatsAppNumber } from "@/lib/phone";
import { addMinutes, buildSlots, dateKeyOf, toInstant } from "@/lib/slots";
import { dbFail, supabaseAdmin, unwrap } from "@/lib/supabase.server";
import { sendWhatsAppMessage } from "@/lib/whatsapp.server";

const PUBLIC_TENANT_FIELDS = [
  "id",
  "slug",
  "nombre_comercio",
  "rubro",
  "direccion",
  "telefono_whatsapp",
  "politica_sena",
  "horas_aviso_previo",
  "activo",
];

function publicTenant(tenant) {
  return Object.fromEntries(PUBLIC_TENANT_FIELDS.map((field) => [field, tenant[field] ?? null]));
}

async function loadBySlug(slug) {
  const response = await supabaseAdmin()
    .from("tenants")
    .select("*")
    .eq("slug", String(slug).trim().toLowerCase())
    .maybeSingle();
  return unwrap(response);
}

async function subscriptionState(tenantId) {
  const response = await supabaseAdmin()
    .from("tenant_subscriptions")
    .select("estado_suscripcion")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return unwrap(response)?.estado_suscripcion || "activa";
}

// Horarios y turnos "vivos" del día (en hora de Argentina) para calcular disponibilidad.
async function loadDay(tenantId, dateKey) {
  const dayStart = toInstant(dateKey, "00:00");
  if (Number.isNaN(dayStart.getTime())) return null;
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const db = supabaseAdmin();

  const [schedules, appointments, blocks] = await Promise.all([
    db.from("schedules").select("dia_semana, hora_inicio, hora_fin, activo").eq("tenant_id", tenantId).eq("activo", true),
    db
      .from("appointments")
      .select("fecha_hora_inicio, fecha_hora_fin, estado, expira_pago_en")
      .eq("tenant_id", tenantId)
      .in("estado", ["confirmado", "pendiente_pago"])
      .lt("fecha_hora_inicio", dayEnd.toISOString())
      .gt("fecha_hora_fin", dayStart.toISOString()),
    db
      .from("blocks")
      .select("inicio, fin")
      .eq("tenant_id", tenantId)
      .lt("inicio", dayEnd.toISOString())
      .gt("fin", dayStart.toISOString()),
  ]);
  return { schedules: unwrap(schedules), appointments: unwrap(appointments), blocks: blocksOrEmpty(blocks) };
}

// La tabla `blocks` llega con la migración 004. Si todavía no se corrió, la agenda sigue funcionando sin bloqueos.
function blocksOrEmpty(response) {
  if (response.error && ["42P01", "PGRST205"].includes(response.error.code)) {
    console.warn("[booking] falta la tabla blocks: corré supabase/migrations/004_bloqueos_y_seguridad.sql");
    return [];
  }
  return unwrap(response);
}

// Reglas de la reserva pública.
const MAX_DAYS_AHEAD = 60; // no se reserva más allá de esto
const MIN_LEAD_MINUTES = 15; // anticipación mínima (también deja margen para pagar la seña)
const MAX_PENDING_PER_PHONE = 2; // reservas impagas simultáneas por teléfono y comercio (anti-spam)

function slotsForDay(dateKey, service, day) {
  if (!day) return [];
  return buildSlots({
    dateKey,
    durationMinutes: service.duracion_minutos,
    schedules: day.schedules,
    appointments: day.appointments,
    blocks: day.blocks,
    minStart: new Date(Date.now() + MIN_LEAD_MINUTES * 60000),
  });
}

function withinHorizon(dateKey) {
  const today = dateKeyOf(new Date().toISOString());
  const limit = dateKeyOf(new Date(Date.now() + MAX_DAYS_AHEAD * 86400000).toISOString());
  return dateKey >= today && dateKey <= limit;
}

async function loadService(tenantId, serviceId) {
  const response = await supabaseAdmin()
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  // un id con formato inválido hace fallar la consulta: para el visitante es "servicio inexistente"
  return response.error ? null : response.data;
}

export const getPublicTenant = createServerFn({ method: "POST" })
  .validator(z.object({ slug: z.string().min(1).max(80) }))
  .handler(async ({ data }) => {
    const tenant = await loadBySlug(data.slug);
    if (!tenant) return null;

    const db = supabaseAdmin();
    const [integration, services, estado] = await Promise.all([
      db.from("tenant_integrations").select("mp_access_token").eq("tenant_id", tenant.id).maybeSingle(),
      db
        .from("services")
        .select("id, nombre, descripcion, duracion_minutos, precio_total, monto_sena")
        .eq("tenant_id", tenant.id)
        .eq("activo", true),
      subscriptionState(tenant.id),
    ]);

    return {
      tenant: publicTenant(tenant),
      estado_suscripcion: estado,
      habilitado: tenant.activo !== false && estado === "activa",
      deposito_online: Boolean(unwrap(integration)?.mp_access_token),
      services: unwrap(services)
        .map((service) => ({
          id: service.id,
          nombre: service.nombre,
          descripcion: service.descripcion || "",
          duracion_minutos: Number(service.duracion_minutos) || 30,
          precio_total: Number(service.precio_total) || 0,
          monto_sena: Number(service.monto_sena) || 0,
        }))
        .sort((a, b) => a.precio_total - b.precio_total),
    };
  });

export const getAvailability = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: z.string().min(1).max(80),
      serviceId: z.string().min(1).max(80),
      dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ data }) => {
    if (!withinHorizon(data.dateKey)) return { slots: [] };

    const tenant = await loadBySlug(data.slug);
    if (!tenant || tenant.activo === false) return { slots: [] };

    const service = await loadService(tenant.id, data.serviceId);
    if (!service || service.activo === false) return { slots: [] };

    const day = await loadDay(tenant.id, data.dateKey);
    return { slots: slotsForDay(data.dateKey, service, day) };
  });

export const createBooking = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: z.string().min(1).max(80),
      serviceId: z.string().min(1).max(80),
      startIso: z.string().min(10).max(40),
      clienteNombre: z.string().trim().min(2, "Ingresá tu nombre").max(120),
      clienteTelefono: z.string().trim().min(6, "Ingresá tu teléfono").max(40),
      // se ignora: la URL de retorno sale de APP_URL, no de lo que mande el navegador
      origin: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const db = supabaseAdmin();
    const tenant = await loadBySlug(data.slug);
    if (!tenant) throw new Error("No encontramos el comercio");

    const estado = await subscriptionState(tenant.id);
    if (tenant.activo === false || estado !== "activa") {
      throw new Error("El sistema de turnos del local está temporalmente inhabilitado");
    }

    const service = await loadService(tenant.id, data.serviceId);
    if (!service || service.activo === false) throw new Error("El servicio seleccionado no está disponible");

    const telefono = toWhatsAppNumber(data.clienteTelefono);
    if (!telefono) throw new Error("Revisá el teléfono: ingresalo con código de área, por ejemplo 11 5555 5555.");

    const start = new Date(data.startIso);
    if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) {
      throw new Error("El horario elegido ya no está disponible");
    }
    const end = addMinutes(start, Number(service.duracion_minutos) || 30);
    const dateKey = dateKeyOf(start.toISOString());
    if (!withinHorizon(dateKey)) throw new Error(`Solo se puede reservar hasta ${MAX_DAYS_AHEAD} días adelante.`);

    await db.rpc("expire_pending_appointments");

    // Anti-spam: un mismo teléfono no puede tener muchos horarios "congelados" sin pagar en el mismo comercio.
    const pending = await db
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("cliente_telefono", telefono)
      .eq("estado", "pendiente_pago");
    if ((pending.count ?? 0) >= MAX_PENDING_PER_PHONE) {
      throw new Error("Ya tenés reservas esperando el pago de la seña. Completá o esperá que venzan para reservar otra.");
    }

    // El horario tiene que ser uno de los que la agenda realmente ofrece (no cualquier hora inventada).
    const day = await loadDay(tenant.id, dateKey);
    const offered = slotsForDay(dateKey, service, day);
    if (!offered.some((slot) => slot.start === start.toISOString())) {
      throw new Error("Ese horario ya no está disponible. Elegí otro por favor.");
    }

    const integration = unwrap(
      await db.from("tenant_integrations").select("mp_access_token").eq("tenant_id", tenant.id).maybeSingle(),
    );
    const montoSena = Number(service.monto_sena) || 0;
    const cobraSena = montoSena > 0 && Boolean(integration?.mp_access_token);
    const codigo = crypto.randomUUID();

    // La restricción anti-solapamiento de la base es la defensa final contra la doble reserva.
    const inserted = await db
      .from("appointments")
      .insert({
        tenant_id: tenant.id,
        service_id: service.id,
        servicio_nombre: service.nombre,
        cliente_nombre: data.clienteNombre,
        cliente_telefono: telefono,
        fecha_hora_inicio: start.toISOString(),
        fecha_hora_fin: end.toISOString(),
        estado: cobraSena ? "pendiente_pago" : "confirmado",
        expira_pago_en: cobraSena ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
        codigo_publico: codigo,
        monto_sena: cobraSena ? montoSena : 0,
        notas: cobraSena ? "" : "Sin seña online: se coordina en el local",
      })
      .select()
      .single();
    if (inserted.error) {
      if (inserted.error.code === "23P01") throw new Error("Ese horario acaba de ocuparse. Elegí otro por favor.");
      throw dbFail(inserted.error, "No pudimos reservar el turno. Probá de nuevo.");
    }
    const appointment = inserted.data;

    if (!cobraSena) {
      await sendWhatsAppMessage(
        tenant.id,
        appointment.cliente_telefono,
        `Hola ${appointment.cliente_nombre}! Tu turno de ${service.nombre} en ${tenant.nombre_comercio} quedó confirmado para el ${formatDateTime(
          appointment.fecha_hora_inicio,
        )}. Te esperamos en ${tenant.direccion || "el local"}.`,
      );
      return { codigo, requierePago: false, initPoint: null };
    }

    try {
      const preference = await createPreference({
        accessToken: integration.mp_access_token,
        tenant,
        service: { ...service, monto_sena: montoSena },
        appointment,
        origin: appOrigin(),
      });
      await db.from("appointments").update({ mp_preference_id: preference.id }).eq("id", appointment.id);
      return { codigo, requierePago: true, initPoint: preference.init_point };
    } catch (error) {
      await db
        .from("appointments")
        .update({ estado: "cancelado", notas: "No se pudo iniciar el pago de la seña" })
        .eq("id", appointment.id);
      throw new Error(error.message || "No pudimos iniciar el pago de la seña");
    }
  });

export const getBookingStatus = createServerFn({ method: "POST" })
  .validator(z.object({ codigo: z.string().min(6).max(80) }))
  .handler(async ({ data }) => {
    const db = supabaseAdmin();
    const found = await db.from("appointments").select("*").eq("codigo_publico", data.codigo).maybeSingle();
    const appointment = unwrap(found);
    if (!appointment) return null;

    const [tenantResponse, integrationResponse] = await Promise.all([
      db.from("tenants").select("*").eq("id", appointment.tenant_id).maybeSingle(),
      db.from("tenant_integrations").select("mp_access_token").eq("tenant_id", appointment.tenant_id).maybeSingle(),
    ]);
    const tenant = unwrap(tenantResponse);
    const integration = unwrap(integrationResponse);

    // Si volvió de Mercado Pago y el webhook todavía no llegó, se consulta el pago directamente.
    let estado = appointment.estado;
    if (estado === "pendiente_pago" && appointment.mp_preference_id && integration?.mp_access_token) {
      const payment = await findApprovedPayment({ accessToken: integration.mp_access_token, appointment }).catch(
        () => null,
      );
      if (payment) {
        const result = await confirmAppointment({ appointment, paymentId: payment.id, tenant });
        if (result.confirmed) estado = "confirmado";
      }
    }

    return {
      codigo: appointment.codigo_publico,
      estado,
      servicio_nombre: appointment.servicio_nombre || "",
      cliente_nombre: appointment.cliente_nombre,
      fecha_hora_inicio: appointment.fecha_hora_inicio,
      monto_sena: Number(appointment.monto_sena) || 0,
      expira_pago_en: appointment.expira_pago_en || null,
      comercio: {
        nombre_comercio: tenant?.nombre_comercio || "",
        direccion: tenant?.direccion || "",
        telefono_whatsapp: tenant?.telefono_whatsapp || "",
        slug: tenant?.slug || "",
        politica_sena: tenant?.politica_sena || "",
      },
    };
  });
