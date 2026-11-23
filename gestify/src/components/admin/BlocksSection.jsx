import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { unwrapDb } from "@/lib/db-errors";
import { formatDateTime } from "@/lib/format";
import { dateKeyOf, toInstant } from "@/lib/slots";
import { getSupabase } from "@/lib/supabase-browser";

const DAY_MS = 24 * 3600 * 1000;

function emptyForm() {
  const today = dateKeyOf(new Date().toISOString());
  return { desde: today, hasta: today, diaCompleto: true, horaInicio: "13:00", horaFin: "15:00", motivo: "", staffId: "" };
}

// Arma el rango [inicio, fin) en hora de Argentina a partir del formulario.
function toRange(form) {
  if (form.diaCompleto) {
    const hasta = form.hasta && form.hasta >= form.desde ? form.hasta : form.desde;
    return { inicio: toInstant(form.desde, "00:00"), fin: new Date(toInstant(hasta, "00:00").getTime() + DAY_MS) };
  }
  return { inicio: toInstant(form.desde, form.horaInicio), fin: toInstant(form.desde, form.horaFin) };
}

/** Bloqueos de agenda: días o franjas puntuales en los que el portal no ofrece turnos. */
export default function BlocksSection({ tenantId, staff = [] }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const blocksQuery = useQuery({
    queryKey: ["blocks", tenantId],
    queryFn: async () =>
      unwrapDb(
        await getSupabase()
          .from("blocks")
          .select("*")
          .eq("tenant_id", tenantId)
          .gte("fin", new Date().toISOString())
          .order("inicio", { ascending: true })
          .limit(100),
      ),
    enabled: Boolean(tenantId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["blocks", tenantId] });

  async function add(event) {
    event.preventDefault();
    const { inicio, fin } = toRange(form);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fin <= inicio) {
      toast.error("Revisá las fechas: el fin tiene que ser posterior al inicio.");
      return;
    }
    setSaving(true);
    try {
      unwrapDb(
        await getSupabase()
          .from("blocks")
          .insert({
            tenant_id: tenantId,
            inicio: inicio.toISOString(),
            fin: fin.toISOString(),
            motivo: form.motivo.trim() || null,
            ...(form.staffId ? { staff_id: form.staffId } : {}),
          }),
      );
      setForm(emptyForm());
      toast.success("Bloqueo agregado: esos horarios ya no se ofrecen en el portal.");
      refresh();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    try {
      unwrapDb(await getSupabase().from("blocks").delete().eq("id", id));
      refresh();
    } catch (error) {
      toast.error(error.message);
    }
  }

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const blocks = blocksQuery.data || [];
  const staffName = Object.fromEntries(staff.map((member) => [member.id, member.nombre]));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg">
          <CalendarOff className="h-4 w-4 text-muted-foreground" />
          Bloqueos y días francos
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Feriados, vacaciones o una franja puntual (un trámite, un almuerzo largo). Los turnos ya tomados no se cancelan solos.
        </p>
      </div>

      <form onSubmit={add} className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="dia-completo" className="text-sm">
            Día completo
          </Label>
          <Switch id="dia-completo" checked={form.diaCompleto} onCheckedChange={(checked) => setForm((f) => ({ ...f, diaCompleto: checked }))} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bloqueo-desde">{form.diaCompleto ? "Desde" : "Día"}</Label>
            <Input id="bloqueo-desde" type="date" required value={form.desde} onChange={set("desde")} />
          </div>
          {form.diaCompleto ? (
            <div className="space-y-1.5">
              <Label htmlFor="bloqueo-hasta">Hasta (inclusive)</Label>
              <Input id="bloqueo-hasta" type="date" min={form.desde} value={form.hasta} onChange={set("hasta")} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="bloqueo-hora-inicio">De</Label>
                <Input id="bloqueo-hora-inicio" type="time" required value={form.horaInicio} onChange={set("horaInicio")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bloqueo-hora-fin">a</Label>
                <Input id="bloqueo-hora-fin" type="time" required value={form.horaFin} onChange={set("horaFin")} />
              </div>
            </div>
          )}
        </div>
        {staff.length ? (
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="bloqueo-quien">¿A quién afecta?</Label>
            <select
              id="bloqueo-quien"
              value={form.staffId}
              onChange={set("staffId")}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todo el local</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  Solo {member.nombre}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="bloqueo-motivo">Motivo (opcional, solo lo ves vos)</Label>
          <Input id="bloqueo-motivo" maxLength={200} placeholder="Feriado, vacaciones…" value={form.motivo} onChange={set("motivo")} />
        </div>
        <Button type="submit" className="mt-4 rounded-full" disabled={saving || !tenantId}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
          Agregar bloqueo
        </Button>
      </form>

      {blocksQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando bloqueos…</p>
      ) : blocksQuery.isError ? (
        <p className="text-sm text-destructive">
          No pudimos cargar los bloqueos ({blocksQuery.error?.message}).{" "}
          <button type="button" className="underline" onClick={() => blocksQuery.refetch()}>
            Reintentar
          </button>
        </p>
      ) : blocks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No hay bloqueos próximos.
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {blocks.map((block) => (
            <div key={block.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {formatDateTime(block.inicio)} → {formatDateTime(block.fin)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[staffName[block.staff_id] ? `Solo ${staffName[block.staff_id]}` : staff.length ? "Todo el local" : "", block.motivo]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                aria-label="Quitar bloqueo"
                onClick={() => remove(block.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
