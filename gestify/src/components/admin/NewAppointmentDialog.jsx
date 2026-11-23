import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createManualAppointment, getAvailability } from "@/lib/booking.functions";
import { unwrapDb } from "@/lib/db-errors";
import { toWhatsAppNumber } from "@/lib/phone";
import { dateKeyOf, toInstant } from "@/lib/slots";
import { getSupabase } from "@/lib/supabase-browser";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function emptyForm() {
  return {
    serviceId: "",
    staffId: "",
    fecha: dateKeyOf(new Date().toISOString()),
    hora: "",
    nombre: "",
    telefono: "",
    notas: "",
    avisar: true,
  };
}

/**
 * Turno cargado por el comercio (llamadas, clientes sin reserva). Sugiere los horarios libres según la agenda,
 * pero permite cualquier hora: es la agenda del comercio. La base igual impide superponer turnos.
 */
export default function NewAppointmentDialog({ open, onOpenChange, tenant, staff, onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(emptyForm());
      setError("");
    }
  }, [open]);

  const servicesQuery = useQuery({
    queryKey: ["services", tenant?.id],
    queryFn: async () =>
      unwrapDb(
        await getSupabase().from("services").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: true }).limit(100),
      ),
    enabled: open && Boolean(tenant?.id),
  });
  const services = (servicesQuery.data || []).filter((service) => service.activo !== false);
  const activeStaff = useMemo(() => staff.filter((member) => member.activo !== false), [staff]);
  const service = services.find((item) => item.id === form.serviceId);

  const suggestions = useQuery({
    queryKey: ["availability-panel", tenant?.slug, form.serviceId, form.fecha, form.staffId],
    queryFn: () =>
      getAvailability({
        data: { slug: tenant.slug, serviceId: form.serviceId, dateKey: form.fecha, staffId: form.staffId || null },
      }),
    enabled: open && Boolean(tenant?.slug && form.serviceId && form.fecha && (!activeStaff.length || form.staffId)),
  });
  const slots = suggestions.data?.slots || [];

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const fueraDeAgenda = form.hora && suggestions.isSuccess && !slots.some((slot) => slot.label === form.hora);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.serviceId) return setError("Elegí un servicio.");
    if (activeStaff.length && !form.staffId) return setError("Elegí el profesional.");
    if (!form.hora) return setError("Elegí la hora.");
    if (form.telefono && !toWhatsAppNumber(form.telefono)) {
      return setError("Revisá el teléfono: con código de área, por ejemplo 11 5555 5555 (o dejalo vacío).");
    }
    setSaving(true);
    try {
      const result = await createManualAppointment({
        data: {
          serviceId: form.serviceId,
          staffId: form.staffId || null,
          startIso: toInstant(form.fecha, form.hora).toISOString(),
          clienteNombre: form.nombre,
          clienteTelefono: form.telefono || undefined,
          notas: form.notas || undefined,
          avisarCliente: form.avisar,
        },
      });
      toast.success(result.avisado ? "Turno agendado y cliente avisado por WhatsApp" : "Turno agendado");
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "No pudimos guardar el turno.");
      suggestions.refetch();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Nuevo turno</DialogTitle>
          <DialogDescription>Para clientes que llaman o llegan sin reserva. Queda confirmado y sin seña.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className={`grid gap-3 ${activeStaff.length ? "sm:grid-cols-2" : ""}`}>
            <div className="space-y-1.5">
              <Label htmlFor="turno-servicio">Servicio</Label>
              <select id="turno-servicio" className={selectClass} value={form.serviceId} onChange={set("serviceId")} required>
                <option value="">{servicesQuery.isLoading ? "Cargando…" : "Elegí un servicio"}</option>
                {services.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre} · {item.duracion_minutos} min
                  </option>
                ))}
              </select>
            </div>
            {activeStaff.length ? (
              <div className="space-y-1.5">
                <Label htmlFor="turno-staff">Profesional</Label>
                <select id="turno-staff" className={selectClass} value={form.staffId} onChange={set("staffId")} required>
                  <option value="">Elegí quién atiende</option>
                  {activeStaff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="turno-fecha">Día</Label>
              <Input id="turno-fecha" type="date" required value={form.fecha} onChange={set("fecha")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="turno-hora">Hora</Label>
              <Input id="turno-hora" type="time" required value={form.hora} onChange={set("hora")} />
            </div>
          </div>

          {form.serviceId && (!activeStaff.length || form.staffId) ? (
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Horarios libres según tu agenda</p>
              {suggestions.isLoading ? (
                <p className="text-xs text-muted-foreground">Buscando…</p>
              ) : slots.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {slots.map((slot) => (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, hora: slot.label }))}
                      className={`rounded-lg border px-2.5 py-1 text-xs tabular-nums ${
                        form.hora === slot.label ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/40"
                      }`}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No quedan horarios libres ese día en tu agenda (podés cargar otra hora igual).</p>
              )}
              {fueraDeAgenda ? (
                <p className="mt-1.5 text-xs text-amber-700">
                  {form.hora} hs está fuera de tus horarios o de los libres{service ? ` para ${service.duracion_minutos} min` : ""}. Se guarda
                  igual si no se superpone con otro turno.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="turno-nombre">Cliente</Label>
              <Input id="turno-nombre" required minLength={2} maxLength={120} value={form.nombre} onChange={set("nombre")} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="turno-telefono">WhatsApp (opcional)</Label>
              <Input id="turno-telefono" type="tel" inputMode="tel" value={form.telefono} onChange={set("telefono")} placeholder="11 5555 5555" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="turno-notas">Notas (opcional)</Label>
            <Textarea id="turno-notas" rows={2} maxLength={400} value={form.notas} onChange={set("notas")} />
          </div>

          {form.telefono ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.avisar} onChange={(event) => setForm((current) => ({ ...current, avisar: event.target.checked }))} />
              Avisarle por WhatsApp (si tenés el envío configurado en Integraciones)
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="rounded-full px-5">
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Agendar turno
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
