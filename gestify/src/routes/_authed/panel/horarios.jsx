import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useMerchant } from "@/hooks/useMerchant";
import { unwrapDb } from "@/lib/db.client";
import { DIAS } from "@/lib/format";
import { getSupabase } from "@/lib/supabase.client";

export const Route = createFileRoute("/_authed/panel/horarios")({ component: SchedulePage });

function SchedulePage() {
  const { data: merchant } = useMerchant();
  const tenantId = merchant?.tenant?.id;
  const queryClient = useQueryClient();

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["schedules", tenantId],
    queryFn: async () => unwrapDb(await getSupabase().from("schedules").select("*").eq("tenant_id", tenantId).limit(100)),
    enabled: Boolean(tenantId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["schedules", tenantId] });

  // Una franja con la hora de fin antes de la de inicio la rechaza la base: se avisa y se vuelve a cargar.
  async function mutate(operation) {
    try {
      await operation();
    } catch (error) {
      toast.error(error.message);
    }
    refresh();
  }

  const addInterval = (dia) =>
    mutate(async () =>
      unwrapDb(
        await getSupabase()
          .from("schedules")
          .insert({ tenant_id: tenantId, dia_semana: dia, hora_inicio: "09:00", hora_fin: "18:00", activo: true }),
      ),
    );

  const updateInterval = (id, patch) =>
    mutate(async () => unwrapDb(await getSupabase().from("schedules").update(patch).eq("id", id)));

  const removeInterval = (id) => mutate(async () => unwrapDb(await getSupabase().from("schedules").delete().eq("id", id)));

  return (
    <div className="space-y-6">
      <div>
        <p className="label-micro">Disponibilidad</p>
        <h1 className="mt-1 text-3xl">Horarios de atención</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El portal público genera los turnos libres a partir de estas franjas y de la duración de cada servicio.
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          Cargando horarios…
        </div>
      ) : (
        <div className="space-y-2">
          {DIAS.map((nombre, dia) => {
            const intervals = schedules
              .filter((schedule) => Number(schedule.dia_semana) === dia)
              .sort((a, b) => String(a.hora_inicio).localeCompare(String(b.hora_inicio)));

            return (
              <div key={dia} className="rounded-2xl border border-border bg-card px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{nombre}</p>
                  <Button variant="ghost" size="sm" className="h-8 rounded-full" onClick={() => addInterval(dia)}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Franja
                  </Button>
                </div>

                {intervals.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">Cerrado</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {intervals.map((interval) => (
                      <div key={interval.id} className="flex flex-wrap items-center gap-2">
                        <Input
                          type="time"
                          value={String(interval.hora_inicio).slice(0, 5)}
                          onChange={(event) => updateInterval(interval.id, { hora_inicio: event.target.value })}
                          className="h-9 w-28"
                        />
                        <span className="text-xs text-muted-foreground">a</span>
                        <Input
                          type="time"
                          value={String(interval.hora_fin).slice(0, 5)}
                          onChange={(event) => updateInterval(interval.id, { hora_fin: event.target.value })}
                          className="h-9 w-28"
                        />
                        <Switch
                          checked={interval.activo !== false}
                          onCheckedChange={(checked) => updateInterval(interval.id, { activo: checked })}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => removeInterval(interval.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}