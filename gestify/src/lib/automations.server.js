import { manageText } from "@/lib/appointments.server";
import { formatDateTime } from "@/lib/format";
import { supabaseAdmin } from "@/lib/supabase.server";
import { sendWhatsAppMessage } from "@/lib/whatsapp.server";

// "Reclama" el recordatorio antes de enviarlo: si dos ejecuciones corren a la vez, solo una lo manda.
async function claimReminder(db, id, field) {
  const { data, error } = await db.from("appointments").update({ [field]: true }).eq("id", id).eq(field, false).select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

const releaseReminder = (db, id, field) => db.from("appointments").update({ [field]: false }).eq("id", id);

/**
 * Tareas programadas del SaaS: expira turnos impagos, marca abonos vencidos y dispara los
 * recordatorios de WhatsApp. Idempotente: se puede ejecutar todas las veces que haga falta.
 */
export async function runAutomations() {
  const db = supabaseAdmin();
  const now = new Date();
  const summary = { expirados: 0, vencidas: 0, recordatorios: 0 };

  // 1. Turnos pendientes de pago fuera de plazo (libera el horario)
  const expired = await db.rpc("expire_pending_appointments");
  if (expired.error) throw expired.error;
  summary.expirados = Number(expired.data) || 0;

  // 2. Abonos vencidos
  const vencidas = await db
    .from("tenant_subscriptions")
    .update({ estado_suscripcion: "vencida" })
    .eq("estado_suscripcion", "activa")
    .lt("fecha_vencimiento_actual", now.toISOString())
    .select("id");
  if (vencidas.error) throw vencidas.error;
  summary.vencidas = vencidas.data?.length ?? 0;

  // 3. Recordatorios de turnos confirmados en las próximas 48 horas
  const hasta = new Date(now.getTime() + 48 * 3600 * 1000);
  const proximos = await db
    .from("appointments")
    .select(
      "id, codigo_publico, tenant_id, cliente_nombre, cliente_telefono, servicio_nombre, fecha_hora_inicio, created_at, recordatorio_1_enviado, recordatorio_2_enviado, tenants(nombre_comercio, direccion, horas_aviso_previo)",
    )
    .eq("estado", "confirmado")
    .gte("fecha_hora_inicio", now.toISOString())
    .lte("fecha_hora_inicio", hasta.toISOString())
    .limit(500);
  if (proximos.error) throw proximos.error;

  for (const appointment of proximos.data || []) {
    const tenant = appointment.tenants;
    if (!tenant) continue;

    const horasAviso = Number(tenant.horas_aviso_previo ?? 24);
    const faltanHoras = (new Date(appointment.fecha_hora_inicio) - now) / 3600000;
    const anticipacion = (new Date(appointment.fecha_hora_inicio) - new Date(appointment.created_at)) / 3600000;
    const base = `Hola ${appointment.cliente_nombre}! Tu turno de ${appointment.servicio_nombre || "servicio"} en ${
      tenant.nombre_comercio
    } es el ${formatDateTime(appointment.fecha_hora_inicio)}.`;

    if (!appointment.recordatorio_1_enviado && anticipacion > horasAviso && faltanHoras <= horasAviso) {
      if (await claimReminder(db, appointment.id, "recordatorio_1_enviado")) {
        const result = await sendWhatsAppMessage(
          appointment.tenant_id,
          appointment.cliente_telefono,
          `${base} Si no podés asistir, avisanos con tiempo.${manageText(appointment.codigo_publico)}`,
        );
        if (result.sent) summary.recordatorios += 1;
        else await releaseReminder(db, appointment.id, "recordatorio_1_enviado");
      }
      continue;
    }

    if (!appointment.recordatorio_2_enviado && faltanHoras <= 2) {
      if (await claimReminder(db, appointment.id, "recordatorio_2_enviado")) {
        const result = await sendWhatsAppMessage(
          appointment.tenant_id,
          appointment.cliente_telefono,
          `${base} Te esperamos en ${tenant.direccion || "el local"}.`,
        );
        if (result.sent) summary.recordatorios += 1;
        else await releaseReminder(db, appointment.id, "recordatorio_2_enviado");
      }
    }
  }

  return summary;
}
