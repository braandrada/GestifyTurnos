import { Clock } from "lucide-react";
import { formatMoney } from "@/lib/format";

export default function ServiceSelector({ services, selectedId, onSelect }) {
  return (
    <div className="space-y-2">
      {services.map((service) => {
        const active = selectedId === service.id;
        return (
          <button
            key={service.id}
            type="button"
            onClick={() => onSelect(service)}
            className={`w-full rounded-2xl border px-4 py-4 text-left transition-all duration-200 ${
              active
                ? "border-primary bg-primary/[0.04] shadow-[0_16px_40px_-32px_rgba(20,15,10,0.7)]"
                : "border-border bg-card hover:border-primary/30"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{service.nombre}</p>
                {service.descripcion ? (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{service.descripcion}</p>
                ) : null}
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {service.duracion_minutos} min
                  {service.monto_sena > 0 ? ` · seña ${formatMoney(service.monto_sena)}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular-nums">{formatMoney(service.precio_total)}</p>
                <span
                  className={`mt-2 inline-block h-2.5 w-2.5 rounded-full ${
                    active ? "bg-primary" : "border border-border"
                  }`}
                />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}