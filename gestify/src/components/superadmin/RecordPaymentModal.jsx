import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";

function nextMonthDate(current) {
  const base = current && new Date(current) > new Date() ? new Date(current) : new Date();
  const next = new Date(base);
  next.setMonth(next.getMonth() + 1);
  return next.toISOString().slice(0, 10);
}

export default function RecordPaymentModal({ open, onOpenChange, tenant, subscription, onSaved }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !tenant) return;
    setError("");
    setForm({
      monto: subscription?.precio_mensual || 0,
      metodo_pago: "transferencia",
      periodo_cubierto: new Date().toISOString().slice(0, 7),
      notas: "",
      nueva_fecha_vencimiento: nextMonthDate(subscription?.fecha_vencimiento_actual),
    });
  }, [open, tenant, subscription]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onSaved({
        tenant_id: tenant.id,
        monto: Number(form.monto) || 0,
        metodo_pago: form.metodo_pago,
        periodo_cubierto: form.periodo_cubierto,
        notas: form.notas,
        nueva_fecha_vencimiento: `${form.nueva_fecha_vencimiento}T12:00:00-03:00`,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err.message || "No pudimos registrar el pago");
    } finally {
      setBusy(false);
    }
  }

  if (!tenant) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Registrar pago mensual</DialogTitle>
          <DialogDescription>
            {tenant.nombre_comercio} · vencimiento actual {formatDate(subscription?.fecha_vencimiento_actual)}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Monto</Label>
              <Input type="number" min="0" step="500" value={form.monto ?? 0} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Método</Label>
              <Select value={form.metodo_pago} onValueChange={(value) => setForm({ ...form, metodo_pago: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Período</Label>
              <Input value={form.periodo_cubierto || ""} onChange={(e) => setForm({ ...form, periodo_cubierto: e.target.value })} placeholder="2026-12" />
            </div>
            <div className="space-y-2">
              <Label>Nuevo vencimiento</Label>
              <Input
                type="date"
                value={form.nueva_fecha_vencimiento || ""}
                onChange={(e) => setForm({ ...form, nueva_fecha_vencimiento: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea rows={2} value={form.notas || ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy} className="rounded-full px-5">
              {busy ? "Guardando…" : "Registrar pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}