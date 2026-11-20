import { CalendarClock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime, formatMoney } from "@/lib/format";

export default function DepositNoticeModal({ open, onOpenChange, onConfirm, service, tenant, startIso, loading }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <span className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarClock className="h-5 w-5" />
          </span>
          <DialogTitle className="font-display text-2xl">Congelá tu turno con la seña</DialogTitle>
          <DialogDescription>
            Para reservar el horario se abona una seña de {formatMoney(service?.monto_sena)} con Mercado Pago. El
            turno queda bloqueado 15 minutos mientras completás el pago.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-xl bg-secondary/70 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Servicio</span>
            <span className="text-right font-medium">{service?.nombre}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Horario</span>
            <span className="text-right font-medium">{formatDateTime(startIso)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Seña</span>
            <span className="text-right font-medium">{formatMoney(service?.monto_sena)}</span>
          </div>
        </div>

        <div className="flex gap-2 rounded-xl border border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p>{tenant?.politica_sena || "La seña no es reembolsable ante cancelaciones fuera de plazo."}</p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Volver
          </Button>
          <Button onClick={onConfirm} disabled={loading} className="rounded-full px-5">
            {loading ? "Procesando…" : "Acepto y pago la seña"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}