import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const EMPTY = {
  nombre: "",
  descripcion: "",
  duracion_minutos: 45,
  precio_total: 0,
  monto_sena: 0,
  activo: true,
};

export default function ServiceDialog({ open, onOpenChange, service, onSave, saving }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (open) setForm(service ? { ...EMPTY, ...service } : EMPTY);
  }, [open, service]);

  const set = (field) => (event) =>
    setForm((current) => ({
      ...current,
      [field]: event.target.type === "checkbox" ? event.target.checked : event.target.value,
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {service?.id ? "Editar servicio" : "Nuevo servicio"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSave({
              nombre: form.nombre.trim(),
              descripcion: form.descripcion?.trim() || "",
              duracion_minutos: Number(form.duracion_minutos) || 30,
              precio_total: Number(form.precio_total) || 0,
              monto_sena: Number(form.monto_sena) || 0,
              activo: form.activo !== false,
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre del servicio</Label>
            <Input id="nombre" value={form.nombre} onChange={set("nombre")} placeholder="Corte + barba" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción (opcional)</Label>
            <Textarea id="descripcion" value={form.descripcion || ""} onChange={set("descripcion")} rows={2} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="duracion">Duración (min)</Label>
              <Input id="duracion" type="number" min="5" step="5" value={form.duracion_minutos} onChange={set("duracion_minutos")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="precio">Precio total</Label>
              <Input id="precio" type="number" min="0" step="100" value={form.precio_total} onChange={set("precio_total")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sena">Seña</Label>
              <Input id="sena" type="number" min="0" step="100" value={form.monto_sena} onChange={set("monto_sena")} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Visible en el portal</p>
              <p className="text-xs text-muted-foreground">Los servicios ocultos no se pueden reservar.</p>
            </div>
            <Switch checked={form.activo !== false} onCheckedChange={(checked) => setForm((f) => ({ ...f, activo: checked }))} />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="rounded-full px-5">
              {saving ? "Guardando…" : "Guardar servicio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}