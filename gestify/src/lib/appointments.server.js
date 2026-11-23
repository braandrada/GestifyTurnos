import { bookingLink } from "@/lib/app-url.server";
import { formatDateTime } from "@/lib/format";

/** " Para cambiar o cancelar: <link>" (vacío si no se puede armar el link). */
export function manageText(codigo) {
  const link = codigo ? bookingLink(codigo) : null;
  return link ? ` Para cambiar o cancelar tu turno: ${link}` : "";
}
import { supabaseAdmin } from "@/lib/supabase.server";
import { sendWhatsAppMessage } from "@/lib/whatsapp.server";

/**
 * Pasa un turno a "confirmado" cuando Mercado Pago aprobó la seña. Lo usan el webhook y la
 * pantalla de estado del pago, así que es idempotente: si ya estaba confirmado no hace nada
 * y no reenvía el WhatsApp.
 *
 * Devuelve { confirmed, conflict?, ignored? }.
 *  - conflict: la seña se pagó tarde y el horario ya lo tomó otra persona (la base lo impide con
 *    la restricción anti-solapamiento). Se deja una nota visible en el panel para reembolsar/reprogramar.
 */
export async function confirmAppointment({ appointment, paymentId, tenant }) {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("appointments")
    .update({ estado: "confirmado", mp_payment_id: String(paymentId), expira_pago_en: null })
    .eq("id", appointment.id)
    .in("estado", ["pendiente_pago", "expirado"])
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23P01") {
      await db
        .from("appointments")
        .update({
          mp_payment_id: String(paymentId),
          notas: "PAGO APROBADO PERO EL HORARIO YA FUE TOMADO POR OTRO TURNO: reembolsá la seña o reprogramá.",
        })
        .eq("id", appointment.id);
      return { confirmed: false, conflict: true };
    }
    if (error.code === "23505") return { confirmed: appointment.estado === "confirmado", duplicate: true };
    throw error;
  }

  // Ya estaba confirmado (o cancelado): nada que hacer.
  if (!data) return { confirmed: appointment.estado === "confirmado", ignored: true };

  let comercio = tenant;
  if (!comercio) {
    const result = await db.from("tenants").select("nombre_comercio").eq("id", appointment.tenant_id).maybeSingle();
    comercio = result.data;
  }
  await sendWhatsAppMessage(
    appointment.tenant_id,
    appointment.cliente_telefono,
    `Hola ${appointment.cliente_nombre}! Recibimos tu seña. Tu turno de ${
      appointment.servicio_nombre || "servicio"
    }${appointment.staff_nombre ? ` con ${appointment.staff_nombre}` : ""} en ${comercio?.nombre_comercio || "el local"} quedó confirmado para el ${formatDateTime(
      appointment.fecha_hora_inicio,
    )}.${manageText(appointment.codigo_publico)}`,
  );
  return { confirmed: true };
}
