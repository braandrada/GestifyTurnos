import { Check, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { whatsAppLink } from "@/lib/phone";

const ESTADOS = {
  pendiente_pago: { label: "Pendiente de seña", className: "border-amber-200 bg-amber-50 text-amber-700" },
  confirmado: { label: "Confirmado", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  cancelado: { label: "Cancelado", className: "border-border bg-secondary text-muted-foreground" },
  expirado: { label: "Expirado", className: "border-red-200 bg-red-50 text-red-700" },
};

function reminderText(appointment, tenantName) {
  return `Hola ${appointment.cliente_nombre}! Te recordamos tu turno de ${appointment.servicio_nombre || "servicio"}${
    appointment.staff_nombre ? ` con ${appointment.staff_nombre}` : ""
  }${
    tenantName ? ` en ${tenantName}` : ""
  } el ${formatDateTime(appointment.fecha_hora_inicio)}. Si no podés venir, avisanos por acá.`;
}

export default function AppointmentList({ appointments, onChangeEstado, emptyText, tenantName }) {
  if (!appointments.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  const groups = appointments.reduce((acc, appointment) => {
    const key = new Date(new Date(appointment.fecha_hora_inicio).getTime() - 3 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    acc[key] = acc[key] || [];
    acc[key].push(appointment);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([dateKey, items]) => (
        <div key={dateKey}>
          <p className="label-micro">{formatDate(`${dateKey}T12:00:00-03:00`)}</p>
          <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {items.map((appointment) => {
              // Pendiente con el plazo vencido: el cron lo pasa a "expirado" en el próximo minuto; se muestra ya así.
              const vencido =
                appointment.estado === "pendiente_pago" &&
                appointment.expira_pago_en &&
                new Date(appointment.expira_pago_en) < new Date();
              const estado = ESTADOS[vencido ? "expirado" : appointment.estado] || ESTADOS.cancelado;
              const wa = whatsAppLink(appointment.cliente_telefono, reminderText(appointment, tenantName));
              return (
                <div key={appointment.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <div className="w-14 shrink-0 text-sm font-medium tabular-nums">
                    {formatTime(appointment.fecha_hora_inicio)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{appointment.cliente_nombre}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {appointment.servicio_nombre || "Servicio"}
                      {appointment.staff_nombre ? ` · con ${appointment.staff_nombre}` : ""} · {appointment.cliente_telefono}
                      {appointment.monto_sena > 0 ? ` · seña ${formatMoney(appointment.monto_sena)}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] ${estado.className}`}>{estado.label}</span>
                  {wa && appointment.estado === "confirmado" ? (
                    <Button asChild size="sm" variant="ghost" className="h-8 rounded-full text-muted-foreground">
                      <a href={wa} target="_blank" rel="noreferrer" aria-label={`Escribirle a ${appointment.cliente_nombre} por WhatsApp`}>
                        <MessageCircle className="mr-1 h-3.5 w-3.5" />
                        WhatsApp
                      </a>
                    </Button>
                  ) : null}
                  {appointment.estado === "pendiente_pago" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full"
                      onClick={() => onChangeEstado(appointment, "confirmado")}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Confirmar
                    </Button>
                  ) : null}
                  {appointment.estado === "confirmado" || appointment.estado === "pendiente_pago" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 rounded-full text-muted-foreground"
                      onClick={() => onChangeEstado(appointment, "cancelado")}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}