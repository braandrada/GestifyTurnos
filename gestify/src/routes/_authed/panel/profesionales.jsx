import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useMerchant } from "@/hooks/useMerchant";
import { unwrapDb } from "@/lib/db-errors";
import { getSupabase } from "@/lib/supabase-browser";

export const Route = createFileRoute("/_authed/panel/profesionales")({ component: StaffPage });

const MISSING = ["42P01", "PGRST205"];

function StaffPage() {
  const { data: merchant } = useMerchant();
  const tenantId = merchant?.tenant?.id;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // null = cerrado; {} = nuevo; {id,...} = editar
  const [confirmId, setConfirmId] = useState(null);

  const staffQuery = useQuery({
    queryKey: ["staff", tenantId],
    queryFn: async () => {
      const supabase = getSupabase();
      const [staff, links] = await Promise.all([
        supabase.from("staff").select("id, nombre, activo, orden").eq("tenant_id", tenantId).order("orden").order("nombre"),
        supabase.from("staff_services").select("staff_id, service_id").eq("tenant_id", tenantId),
      ]);
      if (staff.error && MISSING.includes(staff.error.code)) return { missingSchema: true, staff: [] };
      const serviceIds = new Map();
      for (const link of unwrapDb(links)) serviceIds.set(link.staff_id, [...(serviceIds.get(link.staff_id) || []), link.service_id]);
      return { staff: unwrapDb(staff).map((member) => ({ ...member, serviceIds: serviceIds.get(member.id) || [] })) };
    },
    enabled: Boolean(tenantId),
  });

  const servicesQuery = useQuery({
    queryKey: ["services", tenantId],
    queryFn: async () =>
      unwrapDb(
        await getSupabase().from("services").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: true }).limit(100),
      ),
    enabled: Boolean(tenantId),
  });

  const services = servicesQuery.data || [];
  const serviceName = Object.fromEntries(services.map((service) => [service.id, service.nombre]));
  const staff = staffQuery.data?.staff || [];
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["staff", tenantId] }),
      queryClient.invalidateQueries({ queryKey: ["staff-list", tenantId] }),
    ]);

  async function toggle(member, activo) {
    try {
      unwrapDb(await getSupabase().from("staff").update({ activo }).eq("id", member.id));
      refresh();
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function remove(member) {
    try {
      unwrapDb(await getSupabase().from("staff").delete().eq("id", member.id));
      toast.success(`${member.nombre} eliminado.`);
      refresh();
    } catch (error) {
      toast.error(
        error.code === "23503"
          ? `${member.nombre} tiene turnos en la agenda (o en el historial). Desactivalo con el interruptor: deja de recibir reservas y se conserva el historial.`
          : error.message,
      );
    } finally {
      setConfirmId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-micro">Equipo</p>
          <h1 className="mt-1 text-3xl">Profesionales</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Cada profesional tiene su propia agenda: dos clientes pueden reservar a la misma hora con profesionales distintos. Si no
            cargás ninguno, el local toma un turno a la vez.
          </p>
        </div>
        <Button className="rounded-full" onClick={() => setEditing({})} disabled={staffQuery.data?.missingSchema}>
          <Plus className="mr-1 h-4 w-4" />
          Nuevo profesional
        </Button>
      </div>

      {staffQuery.isLoading ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">Cargando equipo…</div>
      ) : staffQuery.data?.missingSchema ? (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Esta función necesita la actualización de la base de datos <code>005_profesionales.sql</code>. Pedile a la plataforma que la
          aplique.
        </div>
      ) : staffQuery.isError ? (
        <div className="rounded-2xl border border-dashed border-destructive/40 px-5 py-10 text-center text-sm text-destructive">
          No pudimos cargar el equipo ({staffQuery.error?.message}).{" "}
          <button type="button" className="underline" onClick={() => staffQuery.refetch()}>
            Reintentar
          </button>
        </div>
      ) : staff.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
          <p className="text-sm text-muted-foreground">Todavía no cargaste profesionales. El local atiende un turno a la vez.</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={() => setEditing({})}>
            Agregar el primero
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {staff.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <UserRound className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`truncate font-medium ${member.activo ? "" : "text-muted-foreground line-through"}`}>{member.nombre}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {member.serviceIds.length
                    ? member.serviceIds.map((id) => serviceName[id]).filter(Boolean).join(" · ")
                    : "Hace todos los servicios"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={member.activo}
                  onCheckedChange={(checked) => toggle(member, checked)}
                  aria-label={`${member.nombre} toma turnos`}
                />
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Editar ${member.nombre}`} onClick={() => setEditing(member)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {confirmId === member.id ? (
                  <div className="flex items-center gap-1">
                    <Button variant="destructive" size="sm" className="h-8 rounded-full" onClick={() => remove(member)}>
                      Eliminar
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => setConfirmId(null)}>
                      No
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    aria-label={`Eliminar ${member.nombre}`}
                    onClick={() => setConfirmId(member.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {staff.length ? (
        <p className="text-xs text-muted-foreground">
          ¿Horarios distintos por profesional? Cargalos en{" "}
          <Link to="/panel/horarios" className="underline">
            Horarios
          </Link>
          . Quien no tenga horarios propios usa los del local.
        </p>
      ) : null}

      <StaffDialog
        member={editing}
        services={services}
        tenantId={tenantId}
        nextOrden={staff.length}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    </div>
  );
}

function StaffDialog({ member, services, tenantId, nextOrden, onClose, onSaved }) {
  const open = member !== null;
  const [nombre, setNombre] = useState("");
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setNombre(member?.nombre || "");
      setSelected(member?.serviceIds || []);
    }
  }, [open, member]);

  async function save(event) {
    event.preventDefault();
    if (!nombre.trim()) return;
    setSaving(true);
    try {
      const supabase = getSupabase();
      let id = member?.id;
      if (id) {
        unwrapDb(await supabase.from("staff").update({ nombre: nombre.trim() }).eq("id", id));
      } else {
        const created = unwrapDb(
          await supabase.from("staff").insert({ tenant_id: tenantId, nombre: nombre.trim(), orden: nextOrden }).select("id").single(),
        );
        id = created.id;
      }
      // Servicios: se reemplaza la lista completa. Ninguno marcado = hace todos.
      unwrapDb(await supabase.from("staff_services").delete().eq("staff_id", id));
      if (selected.length) {
        unwrapDb(
          await supabase
            .from("staff_services")
            .insert(selected.map((serviceId) => ({ staff_id: id, service_id: serviceId, tenant_id: tenantId }))),
        );
      }
      toast.success("Profesional guardado");
      onSaved();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  const toggleService = (id, checked) =>
    setSelected((current) => (checked ? [...new Set([...current, id])] : current.filter((value) => value !== id)));

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{member?.id ? "Editar profesional" : "Nuevo profesional"}</DialogTitle>
          <DialogDescription>Los clientes ven este nombre al reservar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="staff-nombre">Nombre</Label>
            <Input id="staff-nombre" maxLength={80} required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Lucas" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Servicios que hace</p>
            <p className="text-xs text-muted-foreground">Si no marcás ninguno, hace todos.</p>
            {services.length === 0 ? (
              <p className="text-xs text-muted-foreground">Todavía no cargaste servicios.</p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
                {services.map((service) => (
                  <label key={service.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={selected.includes(service.id)} onCheckedChange={(checked) => toggleService(service.id, checked === true)} />
                    {service.nombre}
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !nombre.trim()} className="rounded-full px-5">
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
