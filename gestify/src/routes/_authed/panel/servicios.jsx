import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import ServiceDialog from "@/components/admin/ServiceDialog";
import { useMerchant } from "@/hooks/useMerchant";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authed/panel/servicios")({ component: ServicesPage });

function ServicesPage() {
  const { data: merchant } = useMerchant();
  const tenantId = merchant?.tenant?.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services", tenantId],
    queryFn: () => base44.entities.Service.filter({ tenant_id: tenantId }, { sort: "created_date", limit: 100 }).then((page) => page.items),
    enabled: Boolean(tenantId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["services", tenantId] });

  async function save(values) {
    setSaving(true);
    try {
      if (editing?.id) await base44.entities.Service.update(editing.id, values);
      else await base44.entities.Service.create({ ...values, tenant_id: tenantId });
      await refresh();
      setDialogOpen(false);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(service, activo) {
    await base44.entities.Service.update(service.id, { activo });
    refresh();
  }

  async function remove(service) {
    await base44.entities.Service.delete(service.id);
    setConfirmId(null);
    refresh();
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