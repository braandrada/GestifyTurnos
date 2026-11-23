import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import BlocksSection from "@/components/admin/BlocksSection";
import { useMerchant } from "@/hooks/useMerchant";
import { useStaff } from "@/hooks/useStaff";
import { unwrapDb } from "@/lib/db-errors";
import { DIAS } from "@/lib/format";
import { getSupabase } from "@/lib/supabase-browser";

export const Route = createFileRoute("/_authed/panel/horarios")({ component: SchedulePage });

function SchedulePage() {
  const { data: merchant } = useMerchant();
  const tenantId = merchant?.tenant?.id;
  const queryClient = useQueryClient();
  const { data: staff = [] } = useStaff(tenantId);
  const [owner, setOwner] = useState(null); // null = horarios del local; id = de ese profesional
  const ownerName = staff.find((member) => member.id === owner)?.nombre;

  const { data: schedules = [], isLoading, isError, error, refetch } = useQuery({
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
          .insert({
            tenant_id: tenantId,
            dia_semana: dia,
            hora_inicio: "09:00",
            hora_fin: "18:00",
            activo: true,
            ...(owner ? { staff_id: owner } : {}),
          }),
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

      {staff.length ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Horarios de</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Horarios de">
            {[{ id: null, nombre: "El local" }, ...staff].map((member) => (
              <button
                key={member.id ?? "local"}
                type="button"
                role="radio"
                aria-checked={owner === member.id}
                onClick={() => setOwner(member.id)}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors ${
                  owner === member.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {member.nombre}
              </button>
            ))}
          </div>
          {owner && !schedules.some((schedule) => schedule.staff_id === owner) ? (
            <p className="rounded-xl border border-border bg-secondary/60 px-4 py-2.5 text-xs text-muted-foreground">
              {ownerName} no tiene horarios propios: atiende en los horarios del local. Agregá una franja para darle horarios distintos.
            </p>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          Cargando horarios…
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-dashed border-destructive/40 px-5 py-10 text-center text-sm text-destructive">
          No pudimos cargar los horarios ({error?.message}).{" "}
          <button type="button" className="underline" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {DIAS.map((nombre, dia) => {
            const intervals = schedules
              .filter((schedule) => (schedule.staff_id ?? null) === owner && Number(schedule.dia_semana) === dia)
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
                          key={`${interval.id}-i-${interval.hora_inicio}`}
                          type="time"
                          aria-label={`${nombre}: hora de inicio`}
                          defaultValue={String(interval.hora_inicio).slice(0, 5)}
                          onBlur={(event) => {
                            const value = event.target.value;
                            if (value && value !== String(interval.hora_inicio).slice(0, 5)) updateInterval(interval.id, { hora_inicio: value });
                          }}
                          className="h-9 w-28"
                        />
                        <span className="text-xs text-muted-foreground">a</span>
                        <Input
                          key={`${interval.id}-f-${interval.hora_fin}`}
                          type="time"
                          aria-label={`${nombre}: hora de fin`}
                          defaultValue={String(interval.hora_fin).slice(0, 5)}
                          onBlur={(event) => {
                            const value = event.target.value;
                            if (value && value !== String(interval.hora_fin).slice(0, 5)) updateInterval(interval.id, { hora_fin: value });
                          }}
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

      <BlocksSection tenantId={tenantId} staff={staff} />
    </div>
  );
}