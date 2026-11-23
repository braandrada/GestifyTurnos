import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { appOrigin } from "@/lib/app-url.server";
import { requireUser } from "@/lib/auth-middleware";
import { confirmAppointment, manageText, newBookingText, notifyMerchant } from "@/lib/appointments.server";
import { formatDateTime } from "@/lib/format";
import { createPreference, findApprovedPayment } from "@/lib/mercadopago.server";
import { toWhatsAppNumber } from "@/lib/phone";
import { addMinutes, buildAvailability, dateKeyOf, toInstant } from "@/lib/slots";
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
async function loadDay(tenantId, dateKey, excludeId = null) {
  const dayStart = toInstant(dateKey, "00:00");
  if (Number.isNaN(dayStart.getTime())) return null;
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const db = supabaseAdmin();
  const withStaff = await hasStaffSchema();
  const staffCol = withStaff ? ", staff_id" : "";

  const [schedules, appointments, blocks] = await Promise.all([
    db.from("schedules").select(`dia_semana, hora_inicio, hora_fin, activo${staffCol}`).eq("tenant_id", tenantId).eq("activo", true),
    db
      .from("appointments")
      .select(`id, fecha_hora_inicio, fecha_hora_fin, estado, expira_pago_en${staffCol}`)
      .eq("tenant_id", tenantId)
      .in("estado", ["confirmado", "pendiente_pago"])
      .lt("fecha_hora_inicio", dayEnd.toISOString())
      .gt("fecha_hora_fin", dayStart.toISOString()),
    db
      .from("blocks")
      .select(`inicio, fin${staffCol}`)
      .eq("tenant_id", tenantId)
      .lt("inicio", dayEnd.toISOString())
      .gt("fin", dayStart.toISOString()),
  ]);
  return {
    schedules: unwrap(schedules),
    appointments: unwrap(appointments).filter((appointment) => appointment.id !== excludeId),
    blocks: blocksOrEmpty(blocks),
  };
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
const CHANGE_DEADLINE_HOURS = 2; // el cliente puede cancelar o reprogramar hasta 2 horas antes del turno
const MAX_RESCHEDULES = 2; // reprogramaciones por turno desde el link del cliente

const MISSING_RELATION = ["42P01", "PGRST205"];

// ¿Está corrida la migración 005 (profesionales)? Solo se cachea el "sí": al correrla se detecta sin redeployar.
let staffSchemaReady = false;
async function hasStaffSchema() {
  if (staffSchemaReady) return true;
  const probe = await supabaseAdmin().from("staff").select("id").limit(1);
  if (probe.error) {
    if (!MISSING_RELATION.includes(probe.error.code)) console.error("[booking] staff", probe.error.code, probe.error.message);
    return false;
  }
  staffSchemaReady = true;
  return true;
}

/**
 * Profesionales activos del comercio y qué servicios hace cada uno.
 * serviceIds vacío = hace todos los servicios.
 */
async function loadStaff(tenantId) {
  if (!(await hasStaffSchema())) return [];
  const db = supabaseAdmin();
  const [staff, links] = await Promise.all([
    db.from("staff").select("id, nombre, orden").eq("tenant_id", tenantId).eq("activo", true).order("orden").order("nombre"),
    db.from("staff_services").select("staff_id, service_id").eq("tenant_id", tenantId),
  ]);
  const serviceIdsByStaff = new Map();
  for (const link of unwrap(links)) {
    serviceIdsByStaff.set(link.staff_id, [...(serviceIdsByStaff.get(link.staff_id) || []), link.service_id]);
  }
  return unwrap(staff).map((member) => ({ id: member.id, nombre: member.nombre, serviceIds: serviceIdsByStaff.get(member.id) || [] }));
}

const doesService = (member, serviceId) => member.serviceIds.length === 0 || member.serviceIds.includes(serviceId);

function slotsForDay(dateKey, service, day, staff, staffId = null) {
  if (!day) return [];
  return buildAvailability({
    dateKey,
    durationMinutes: service.duracion_minutos,
    schedules: day.schedules,
    appointments: day.appointments,
    blocks: day.blocks,
    usesStaff: staff.length > 0,
    staff: staff.filter((member) => doesService(member, service.id)),
    staffId,
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
    const [integration, services, estado, staff] = await Promise.all([
      db.from("tenant_integrations").select("mp_access_token").eq("tenant_id", tenant.id).maybeSingle(),
      db
        .from("services")
        .select("id, nombre, descripcion, duracion_minutos, precio_total, monto_sena")
        .eq("tenant_id", tenant.id)
        .eq("activo", true),
      subscriptionState(tenant.id),
      loadStaff(tenant.id),
    ]);

    return {
      // Solo id, nombre y servicios: el cliente elige profesional o "Cualquiera".
      staff,
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
        // Con profesionales cargados, un servicio que nadie hace no se ofrece.
        .filter((service) => !staff.length || staff.some((member) => doesService(member, service.id)))
        .sort((a, b) => a.precio_total - b.precio_total),
    };
  });

export const getAvailability = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: z.string().min(1).max(80),
      serviceId: z.string().min(1).max(80),
      dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      staffId: z.string().uuid().nullish(),
      // Al reprogramar: el turno actual no cuenta como ocupado (hace falta el código, que es secreto).
      codigo: z.string().min(6).max(80).nullish(),
    }),
  )
  .handler(async ({ data }) => {
    if (!withinHorizon(data.dateKey)) return { slots: [] };

    const tenant = await loadBySlug(data.slug);
    if (!tenant || tenant.activo === false) return { slots: [] };

    const service = await loadService(tenant.id, data.serviceId);
    if (!service || service.activo === false) return { slots: [] };

    let excludeId = null;
    if (data.codigo) {
      const own = await supabaseAdmin()
        .from("appointments")
        .select("id")
        .eq("codigo_publico", data.codigo)
        .eq("tenant_id", tenant.id)
        .maybeSingle();
      excludeId = own.data?.id ?? null;
    }
    const [day, staff] = await Promise.all([loadDay(tenant.id, data.dateKey, excludeId), loadStaff(tenant.id)]);
    // Al navegador solo va el horario: qué profesional queda libre se resuelve al reservar.
    const slots = slotsForDay(data.dateKey, service, day, staff, data.staffId || null);
    return { slots: slots.map(({ start, label }) => ({ start, label })) };
  });

export const createBooking = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: z.string().min(1).max(80),
      serviceId: z.string().min(1).max(80),
      startIso: z.string().min(10).max(40),
      clienteNombre: z.string().trim().min(2, "Ingresá tu nombre").max(120),
      clienteTelefono: z.string().trim().min(6, "Ingresá tu teléfono").max(40),
      staffId: z.string().uuid().nullish(),
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
    const [day, staff] = await Promise.all([loadDay(tenant.id, dateKey), loadStaff(tenant.id)]);
    const offered = slotsForDay(dateKey, service, day, staff, data.staffId || null).find(
      (slot) => slot.start === start.toISOString(),
    );
    if (!offered) throw new Error("Ese horario ya no está disponible. Elegí otro por favor.");
    // Profesionales libres en ese horario (en orden). Sin profesionales: un único intento "del local".
    const candidates = staff.length ? offered.staffIds.map((id) => staff.find((member) => member.id === id)) : [null];

    const integration = unwrap(
      await db.from("tenant_integrations").select("mp_access_token").eq("tenant_id", tenant.id).maybeSingle(),
    );
    const montoSena = Number(service.monto_sena) || 0;
    const cobraSena = montoSena > 0 && Boolean(integration?.mp_access_token);
    const codigo = crypto.randomUUID();

    // La restricción anti-solapamiento de la base es la defensa final contra la doble reserva.
    // Con "Cualquiera", si el primer profesional se ocupó en el medio, se prueba con el siguiente libre.
    let inserted = null;
    for (const member of candidates) {
      inserted = await db
        .from("appointments")
        .insert({
          ...(member ? { staff_id: member.id, staff_nombre: member.nombre } : {}),
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
      if (inserted.error?.code !== "23P01") break;
    }
    if (inserted.error) {
      if (inserted.error.code === "23P01") throw new Error("Ese horario acaba de ocuparse. Elegí otro por favor.");
      throw dbFail(inserted.error, "No pudimos reservar el turno. Probá de nuevo.");
    }
    const appointment = inserted.data;

    if (!cobraSena) {
      await sendWhatsAppMessage(
        tenant.id,
        appointment.cliente_telefono,
        `Hola ${appointment.cliente_nombre}! Tu turno de ${service.nombre}${
          appointment.staff_nombre ? ` con ${appointment.staff_nombre}` : ""
        } en ${tenant.nombre_comercio} quedó confirmado para el ${formatDateTime(
          appointment.fecha_hora_inicio,
        )}. Te esperamos en ${tenant.direccion || "el local"}.${manageText(appointment.codigo_publico)}`,
      );
      await notifyMerchant(tenant, newBookingText(appointment));
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
      staff_nombre: appointment.staff_nombre || "",
      service_id: appointment.service_id,
      staff_id: appointment.staff_id || null,
      // El cliente puede cancelar/reprogramar un turno confirmado hasta CHANGE_DEADLINE_HOURS antes.
      puede_cancelar: estado === "confirmado" && canChange(appointment),
      puede_reprogramar:
        estado === "confirmado" && canChange(appointment) && Boolean(appointment.service_id) && reschedulesOf(appointment) < MAX_RESCHEDULES,
      limite_cambios_horas: CHANGE_DEADLINE_HOURS,
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

// ---------------------------------------------------------------------
// Cambios del cliente desde el link de su turno (/pago/:codigo). El código es la "llave": UUID no adivinable.
// ---------------------------------------------------------------------

function canChange(appointment) {
  return new Date(appointment.fecha_hora_inicio).getTime() - Date.now() > CHANGE_DEADLINE_HOURS * 3600 * 1000;
}

// Cuántas veces se reprogramó: se cuenta en las notas, sin tocar el esquema.
const RESCHEDULE_MARK = "[reprogramado]";
const reschedulesOf = (appointment) => String(appointment.notas || "").split(RESCHEDULE_MARK).length - 1;

async function loadOwnAppointment(codigo) {
  const db = supabaseAdmin();
  const appointment = unwrap(await db.from("appointments").select("*").eq("codigo_publico", codigo).maybeSingle());
  if (!appointment) throw new Error("No encontramos tu turno. Revisá el link.");
  const tenant = unwrap(await db.from("tenants").select("*").eq("id", appointment.tenant_id).maybeSingle());
  if (!tenant) throw new Error("No encontramos el comercio");
  return { db, appointment, tenant };
}

function assertChangeable(appointment) {
  if (appointment.estado !== "confirmado") throw new Error("Este turno ya no se puede modificar.");
  if (!canChange(appointment)) {
    throw new Error(`Los cambios se pueden hacer hasta ${CHANGE_DEADLINE_HOURS} horas antes. Escribile al local por WhatsApp.`);
  }
}

export const cancelBooking = createServerFn({ method: "POST" })
  .validator(z.object({ codigo: z.string().min(6).max(80) }))
  .handler(async ({ data }) => {
    const { db, appointment, tenant } = await loadOwnAppointment(data.codigo);
    assertChangeable(appointment);

    // Condición sobre el estado: si dos pestañas cancelan a la vez, solo una lo hace.
    const updated = unwrap(
      await db
        .from("appointments")
        .update({ estado: "cancelado", notas: `${appointment.notas ? `${appointment.notas} ` : ""}Cancelado por el cliente.`.trim() })
        .eq("id", appointment.id)
        .eq("estado", "confirmado")
        .select("id")
        .maybeSingle(),
    );
    if (!updated) throw new Error("Este turno ya no se puede modificar.");

    await notifyMerchant(
      tenant,
      `Turno cancelado por el cliente: ${appointment.cliente_nombre} (${appointment.servicio_nombre || "servicio"}${
        appointment.staff_nombre ? ` con ${appointment.staff_nombre}` : ""
      }) del ${formatDateTime(appointment.fecha_hora_inicio)}.${
        Number(appointment.monto_sena) > 0 ? " Tenía seña pagada: revisá si corresponde reembolsar." : ""
      }`,
    );
    return { ok: true };
  });

export const rescheduleBooking = createServerFn({ method: "POST" })
  .validator(
    z.object({
      codigo: z.string().min(6).max(80),
      startIso: z.string().min(10).max(40),
      staffId: z.string().uuid().nullish(),
    }),
  )
  .handler(async ({ data }) => {
    const { db, appointment, tenant } = await loadOwnAppointment(data.codigo);
    assertChangeable(appointment);
    if (reschedulesOf(appointment) >= MAX_RESCHEDULES) {
      throw new Error("Ya reprogramaste este turno. Para otro cambio escribile al local por WhatsApp.");
    }
    const estado = await subscriptionState(tenant.id);
    if (tenant.activo === false || estado !== "activa") throw new Error("El sistema de turnos del local está temporalmente inhabilitado");

    const service = appointment.service_id ? await loadService(tenant.id, appointment.service_id) : null;
    if (!service) throw new Error("El servicio de este turno ya no está disponible. Escribile al local.");

    const start = new Date(data.startIso);
    if (Number.isNaN(start.getTime())) throw new Error("Elegí un horario válido.");
    const dateKey = dateKeyOf(start.toISOString());
    if (!withinHorizon(dateKey)) throw new Error(`Solo se puede reservar hasta ${MAX_DAYS_AHEAD} días adelante.`);

    const [day, staff] = await Promise.all([loadDay(tenant.id, dateKey, appointment.id), loadStaff(tenant.id)]);
    const offered = slotsForDay(dateKey, service, day, staff, data.staffId || null).find((slot) => slot.start === start.toISOString());
    if (!offered) throw new Error("Ese horario ya no está disponible. Elegí otro por favor.");

    // Mismo profesional si sigue libre; si no (o eligió "Cualquiera"), el primero libre.
    const pick = staff.length
      ? (offered.staffIds.includes(appointment.staff_id) && !data.staffId ? appointment.staff_id : offered.staffIds[0])
      : null;
    const member = staff.find((m) => m.id === pick) || null;

    const end = addMinutes(start, Number(service.duracion_minutos) || 30);
    const updated = await db
      .from("appointments")
      .update({
        fecha_hora_inicio: start.toISOString(),
        fecha_hora_fin: end.toISOString(),
        ...(staff.length ? { staff_id: member?.id ?? null, staff_nombre: member?.nombre ?? null } : {}),
        recordatorio_1_enviado: false,
        recordatorio_2_enviado: false,
        notas: `${appointment.notas ? `${appointment.notas} ` : ""}${RESCHEDULE_MARK} antes: ${formatDateTime(appointment.fecha_hora_inicio)}.`,
      })
      .eq("id", appointment.id)
      .eq("estado", "confirmado")
      .select("*")
      .maybeSingle();
    if (updated.error) {
      if (updated.error.code === "23P01") throw new Error("Ese horario acaba de ocuparse. Elegí otro por favor.");
      throw dbFail(updated.error, "No pudimos reprogramar el turno. Probá de nuevo.");
    }
    if (!updated.data) throw new Error("Este turno ya no se puede modificar.");

    const nuevo = updated.data;
    const con = nuevo.staff_nombre ? ` con ${nuevo.staff_nombre}` : "";
    await sendWhatsAppMessage(
      tenant.id,
      nuevo.cliente_telefono,
      `Hola ${nuevo.cliente_nombre}! Reprogramamos tu turno de ${nuevo.servicio_nombre || "servicio"}${con} en ${
        tenant.nombre_comercio
      } para el ${formatDateTime(nuevo.fecha_hora_inicio)}.`,
    );
    await notifyMerchant(
      tenant,
      `Turno reprogramado por el cliente: ${nuevo.cliente_nombre} (${nuevo.servicio_nombre || "servicio"}${con}) pasó del ${formatDateTime(
        appointment.fecha_hora_inicio,
      )} al ${formatDateTime(nuevo.fecha_hora_inicio)}.`,
    );
    return { ok: true, fecha_hora_inicio: nuevo.fecha_hora_inicio };
  });

// ---------------------------------------------------------------------
// Turno cargado por el comercio desde el panel (llamadas, clientes sin reserva).
// El tenant sale del perfil del usuario, nunca del navegador. El comercio puede salirse de sus horarios
// (es su agenda), pero la base igual impide superponer dos turnos del mismo profesional.
// ---------------------------------------------------------------------
export const createManualAppointment = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      serviceId: z.string().uuid(),
      staffId: z.string().uuid().nullish(),
      startIso: z.string().min(10).max(40),
      clienteNombre: z.string().trim().min(2, "Ingresá el nombre del cliente").max(120),
      clienteTelefono: z.string().trim().max(40).optional(),
      notas: z.string().trim().max(400).optional(),
      avisarCliente: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const tenantId = context.profile?.tenant_id;
    if (!tenantId || context.profile?.tipo_usuario !== "comerciante") throw new Error("Tu usuario no tiene un comercio asociado");
    const db = supabaseAdmin();
    const tenant = unwrap(await db.from("tenants").select("*").eq("id", tenantId).maybeSingle());
    if (!tenant) throw new Error("Tu usuario no tiene un comercio asociado");

    const service = await loadService(tenant.id, data.serviceId);
    if (!service) throw new Error("Elegí un servicio válido");

    const staff = await loadStaff(tenant.id);
    let member = null;
    if (staff.length) {
      member = staff.find((m) => m.id === data.staffId) || null;
      if (!member) throw new Error("Elegí el profesional que atiende el turno");
    }

    let telefono = null;
    if (data.clienteTelefono) {
      telefono = toWhatsAppNumber(data.clienteTelefono);
      if (!telefono) throw new Error("Revisá el teléfono: con código de área, por ejemplo 11 5555 5555 (o dejalo vacío).");
    }

    const start = new Date(data.startIso);
    if (Number.isNaN(start.getTime())) throw new Error("Elegí fecha y hora");
    // Se permite cargar un turno de hoy que ya empezó (cliente que llegó sin reserva), no días pasados.
    if (start.getTime() < Date.now() - 12 * 3600 * 1000) throw new Error("No se pueden cargar turnos de días anteriores");
    const end = addMinutes(start, Number(service.duracion_minutos) || 30);

    const inserted = await db
      .from("appointments")
      .insert({
        tenant_id: tenant.id,
        service_id: service.id,
        servicio_nombre: service.nombre,
        ...(member ? { staff_id: member.id, staff_nombre: member.nombre } : {}),
        cliente_nombre: data.clienteNombre,
        cliente_telefono: telefono,
        fecha_hora_inicio: start.toISOString(),
        fecha_hora_fin: end.toISOString(),
        estado: "confirmado",
        expira_pago_en: null,
        codigo_publico: crypto.randomUUID(),
        monto_sena: 0,
        notas: ["Cargado desde el panel.", data.notas].filter(Boolean).join(" "),
      })
      .select("*")
      .single();
    if (inserted.error) {
      if (inserted.error.code === "23P01") {
        throw new Error(member ? `${member.nombre} ya tiene un turno en ese horario.` : "Ya hay un turno en ese horario.");
      }
      throw dbFail(inserted.error, "No pudimos guardar el turno. Probá de nuevo.");
    }

    const appointment = inserted.data;
    let avisado = false;
    if (data.avisarCliente && telefono) {
      const result = await sendWhatsAppMessage(
        tenant.id,
        telefono,
        `Hola ${appointment.cliente_nombre}! Te agendamos un turno de ${service.nombre}${member ? ` con ${member.nombre}` : ""} en ${
          tenant.nombre_comercio
        } para el ${formatDateTime(appointment.fecha_hora_inicio)}. Si necesitás cambiarlo: ${appOrigin()}/pago/${appointment.codigo_publico}`,
      );
      avisado = result.sent;
    }
    return { ok: true, codigo: appointment.codigo_publico, avisado };
  });
