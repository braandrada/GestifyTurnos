import { AlertTriangle, Repeat } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";

const TONES = {
  activa: "border-primary/25 bg-primary/[0.05]",
  vencida: "border-amber-300/60 bg-amber-50",
  suspendida: "border-destructive/30 bg-destructive/[0.06]",
};

export default function SubscriptionBanner({ subscription }) {
  const estado = subscription?.estado_suscripcion || "activa";
  const pendiente = estado !== "activa";

  return (
    <div className={`rounded-2xl border px-5 py-4 ${TONES[estado] || TONES.activa}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          {pendiente ? <AlertTriangle className="mt-0.5 h-4 w-4 text-accent" /> : null}
          <div>
            <p className="text-sm font-medium">
              {estado === "activa"
                ? "Tu abono mensual está al día"
                : estado === "vencida"
                  ? "Tu abono está vencido"
                  : "Tu cuenta está suspendida"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {estado === "activa"
                ? `Próximo vencimiento: ${formatDate(subscription?.fecha_vencimiento_actual)}`
                : "El portal público de reservas queda pausado hasta regularizar el pago. Contactá a la plataforma."}
            </p>
            {subscription?.mp_estado === "authorized" ? (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-primary">
                <Repeat className="h-3 w-3" />
                Débito automático con Mercado Pago activo
              </p>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium tabular-nums">{formatMoney(subscription?.precio_mensual)}</p>
          <p className="text-[11px] text-muted-foreground">por mes</p>
        </div>
      </div>
    </div>
  );
}