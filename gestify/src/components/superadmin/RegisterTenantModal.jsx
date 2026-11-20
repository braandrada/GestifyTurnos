import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/format";

function inDays(days) {
  const date = new Date(Date.now() + days * 86400000);
  return date.toISOString().slice(0, 10);
}

const EMPTY = {
  email: "",
  nombre_comercio: "",
  rubro: "",
  slug: "",
  direccion: "",
  telefono_whatsapp: "",
  precio_mensual: 30000,
  fecha_vencimiento: inDays(30),
  politica_sena: "La seña no es reembolsable si cancelás con menos de 24 horas de anticipación.",
};

export default function RegisterTenantModal({ open, onOpenChange, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, fecha_vencimiento: inDays(30) });
      setError("");
      setResult(null);
    }
  }, [open]);

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await onSaved({
        ...form,
        slug: form.slug || slugify(form.nombre_comercio),
        fecha_vencimiento: `${form.fecha_vencimiento}T12:00:00-03:00`,
      });
      setResult(response);
    } catch (err) {
      setError(err.message || "No pudimos crear el comercio");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Nuevo comercio</DialogTitle>
          <DialogDescription>
            Se crea el local, su suscripción mensual y se invita por email al usuario del comerciante.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-xl bg-primary/[0.06] px-4 py-3">
              <strong>{result.tenant.nombre_comercio}</strong> quedó activo en <code>/{result.tenant.slug}</code>.
            </p>
            <p className="text-muted-foreground">
              {result.invite?.invitado
                ? `Inviamos a ${form.email} para que cree su contraseña y acceda al panel.`
                : `El usuario ${form.email} ya existía, podés asignarle acceso desde la administración de usuarios.`}
            </p>
            <DialogFooter>
              <Button className="rounded-full" onClick={() => onOpenChange(false)}>
                Listo
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Email del comerciante</Label>
                <Input type="email" value={form.email} onChange={set("email")} placeholder="duenio@local.com" required />
              </div>
              <div className="space-y-2">
                <Label>Nombre del comercio</Label>
                <Input value={form.nombre_comercio} onChange={set("nombre_comercio")} placeholder="Estudio Norte" required />
              </div>
              <div className="space-y-2">
                <Label>Rubro</Label>
                <Input value={form.rubro} onChange={set("rubro")} placeholder="Barbería" required />
              </div>
              <div className="space-y-2">
                <Label>Slug (link público)</Label>
                <Input value={form.slug} onChange={set("slug")} placeholder={slugify(form.nombre_comercio) || "estudio-norte"} />
              </div>
              <div className="space-y-2">
                <Label>Dirección</Label>
                <Input value={form.direccion} onChange={set("direccion")} placeholder="Av. Siempre Viva 742" />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp del local</Label>
                <Input value={form.telefono_whatsapp} onChange={set("telefono_whatsapp")} placeholder="11 5555 5555" />
              </div>
              <div className="space-y-2">
                <Label>Abono mensual</Label>
                <Input type="number" min="0" step="1000" value={form.precio_mensual} onChange={set("precio_mensual")} />
              </div>
              <div className="space-y-2">
                <Label>Vence el</Label>
                <Input type="date" value={form.fecha_vencimiento} onChange={set("fecha_vencimiento")} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Política de seña</Label>
              <Textarea rows={2} value={form.politica_sena} onChange={set("politica_sena")} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy} className="rounded-full px-5">
                {busy ? "Creando…" : "Crear comercio"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}