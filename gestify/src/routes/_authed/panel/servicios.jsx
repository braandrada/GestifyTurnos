import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import ServiceDialog from "@/components/admin/ServiceDialog";
import { useMerchant } from "@/hooks/useMerchant";
import { unwrapDb } from "@/lib/db-errors";
import { formatMoney } from "@/lib/format";
import { getSupabase } from "@/lib/supabase-browser";

export const Route = createFileRoute("/_authed/panel/servicios")({ component: ServicesPage });

function ServicesPage() {
  const { data: merchant } = useMerchant();
  const tenantId = merchant?.tenant?.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const { data: services = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["services", tenantId],
    queryFn: async () =>
      unwrapDb(
        await getSupabase().from("services").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: true }).limit(100),
      ),
    enabled: Boolean(tenantId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["services", tenantId] });

  async function save(values) {
    setSaving(true);
    try {
      const table = getSupabase().from("services");
      if (editing?.id) unwrapDb(await table.update(values).eq("id", editing.id));
      else unwrapDb(await table.insert({ ...values, tenant_id: tenantId }));
      await refresh();
      setDialogOpen(false);
      setEditing(null);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(service, activo) {
    try {
      unwrapDb(await getSupabase().from("services").update({ activo }).eq("id", service.id));
      refresh();
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function remove(service) {
    try {
      unwrapDb(await getSupabase().from("services").delete().eq("id", service.id));
      setConfirmId(null);
      refresh();
    } catch (error) {
      toast.error(error.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-micro">Catálogo</p>
          <h1 className="mt-1 text-3xl">Servicios</h1>
          <p className="mt-1 text-sm text-muted-foreground">Duración, precio y seña de cada servicio que ofrecés.</p>
        </div>
        <Button
          className="rounded-full"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Nuevo servicio
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          Cargando servicios…
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-dashed border-destructive/40 px-5 py-10 text-center text-sm text-destructive">
          No pudimos cargar los servicios ({error?.message}).{" "}
          <button type="button" className="underline" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
          <p className="text-sm text-muted-foreground">Todavía no cargaste servicios.</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={() => setDialogOpen(true)}>
            Crear el primero
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {services.map((service) => (
            <div key={service.id} className="flex flex-wrap items-center gap-3 px-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{service.nombre}</p>
                <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {service.duracion_minutos} min · {formatMoney(service.precio_total)}
                  {service.monto_sena > 0 ? ` · seña ${formatMoney(service.monto_sena)}` : " · sin seña"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Switch checked={service.activo !== false} onCheckedChange={(checked) => toggle(service, checked)} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setEditing(service);
                    setDialogOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {confirmId === service.id ? (
                  <div className="flex items-center gap-1">
                    <Button variant="destructive" size="sm" className="h-8 rounded-full" onClick={() => remove(service)}>
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
                    onClick={() => setConfirmId(service.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ServiceDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        service={editing}
        onSave={save}
        saving={saving}
      />
    </div>
  );
}