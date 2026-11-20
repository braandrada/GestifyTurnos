import { ExternalLink, Power, Receipt } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";

const ESTADOS = {
  activa: { label: "Activa", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  vencida: { label: "Vencida", className: "border-amber-200 bg-amber-50 text-amber-700" },
  suspendida: { label: "Suspendida", className: "border-red-200 bg-red-50 text-red-700" },
};

export default function TenantsTable({ rows, onPay, onToggle }) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center text-sm text-muted-foreground">
        Todavía no hay comercios registrados. Creá el primero con “Nuevo comercio”.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="hidden grid-cols-[1.6fr_0.8fr_0.8fr_0.7fr_auto] gap-3 border-b border-border bg-secondary/50 px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground lg:grid">
        <span>Comercio</span>
        <span>Abono</span>
        <span>Vencimiento</span>
        <span>Estado</span>
        <span className="text-right">Acciones</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map(({ tenant, subscription }) => {
          const estado = ESTADOS[subscription?.estado_suscripcion] || ESTADOS.activa;
          const suspendida = subscription?.estado_suscripcion === "suspendida";
          return (
            <div
              key={tenant.id}
              className="grid grid-cols-1 items-center gap-3 px-4 py-3.5 lg:grid-cols-[1.6fr_0.8fr_0.8fr_0.7fr_auto]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{tenant.nombre_comercio}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {tenant.rubro} · /{tenant.slug}
                </p>
              </div>
              <p className="text-sm tabular-nums">{formatMoney(subscription?.precio_mensual)}</p>
              <p className="text-sm text-muted-foreground">{formatDate(subscription?.fecha_vencimiento_actual)}</p>
              <div>
                <span className={`inline-block rounded-full border px-2.5 py-1 text-[11px] ${estado.className}`}>
                  {estado.label}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => onPay(tenant, subscription)}>
                  <Receipt className="mr-1 h-3.5 w-3.5" />
                  Pago
                </Button>
                <Button
                  size="sm"
                  variant={suspendida ? "default" : "ghost"}
                  className="h-8 rounded-full"
                  onClick={() => onToggle(tenant, subscription, suspendida ? "activa" : "suspendida")}
                >
                  <Power className="mr-1 h-3.5 w-3.5" />
                  {suspendida ? "Reactivar" : "Suspender"}
                </Button>
                <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                  <Link to="/$slug" params={{ slug: tenant.slug }} target="_blank">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}