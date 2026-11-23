import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Clock3, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import NewAppointmentDialog from "@/components/admin/NewAppointmentDialog";
import { toast } from "sonner";
import { useState } from "react";
import { useMerchant } from "@/hooks/useMerchant";
import { useStaff } from "@/hooks/useStaff";
import AppointmentList from "@/components/admin/AppointmentList";
import SubscriptionBanner from "@/components/admin/SubscriptionBanner";
import { unwrapDb } from "@/lib/db-errors";
import { getSupabase } from "@/lib/supabase-browser";
import { dateKeyOf } from "@/lib/slots";
import { formatDateTime, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authed/panel/")({ component: Dashboard });

function Dashboard() {
  const { data: merchant } = useMerchant();
  const tenantId = merchant?.tenant?.id;
  const queryClient = useQueryClient();
  const { data: staff = [] } = useStaff(tenantId);
  const [staffFilter, setStaffFilter] = useState("todos");
  const [nuevoOpen, setNuevoOpen] = useState(false);

  const { data: appointments = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["appointments", tenantId],
    // Turnos del mes en curso en adelante: alcanza para "hoy", "próximos" y "señas del mes".
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      return unwrapDb(
        await getSupabase()
          .from("appointments")
          // "*" y no una lista de columnas: staff_id/staff_nombre existen solo con la migración 005.
          .select("*")
          .eq("tenant_id", tenantId)
          .gte("fecha_hora_inicio", monthStart.toISOString())
          .order("fecha_hora_inicio", { ascending: true })
          .limit(500),
      );
    },
    enabled: Boolean(tenantId),
  });

  async function changeEstado(appointment, estado) {
    if (estado === "cancelado" && !window.confirm(`¿Cancelar el turno de ${appointment.cliente_nombre}? El horario vuelve a quedar libre.`)) {
      return;
    }
    try {
      // Confirmar a mano (p. ej. seña cobrada en efectivo) quita el vencimiento del pago.
      const patch = estado === "confirmado" ? { estado, expira_pago_en: null } : { estado };
      unwrapDb(await getSupabase().from("appointments").update(patch).eq("id", appointment.id));
      toast.success(estado === "confirmado" ? "Turno confirmado" : "Turno cancelado");
      queryClient.invalidateQueries({ queryKey: ["appointments", tenantId] });
    } catch (error) {
      toast.error(error.message);
    }
  }

  const now = new Date();
  const todayKey = dateKeyOf(now.toISOString());
  const delFiltro = (a) => staffFilter === "todos" || (a.staff_id ?? "sin") === staffFilter;
  const activos = appointments.filter((a) => (a.estado === "confirmado" || a.estado === "pendiente_pago") && delFiltro(a));
  // Hoy: todos los turnos del día (también los que ya pasaron). Próximos: de mañana en adelante.
  const hoy = activos.filter((a) => dateKeyOf(a.fecha_hora_inicio) === todayKey);
  const proximos = activos
    .filter((a) => new Date(a.fecha_hora_inicio) >= now && dateKeyOf(a.fecha_hora_inicio) > todayKey)
    .sort((a, b) => a.fecha_hora_inicio.localeCompare(b.fecha_hora_inicio));
  const pendientes = activos.filter((a) => a.estado === "pendiente_pago");
  // Seña aprobada por Mercado Pago cuando el horario ya lo había tomado otro turno: hay que reembolsar o reprogramar.
  const conflictos = appointments.filter((a) => a.mp_payment_id && a.estado !== "confirmado");
  const senasDelMes = appointments
    .filter((a) => a.estado === "confirmado" && dateKeyOf(a.fecha_hora_inicio).slice(0, 7) === todayKey.slice(0, 7))
    .reduce((total, a) => total + (Number(a.monto_sena) || 0), 0);

  const stats = [
    { label: "Turnos hoy", value: hoy.length, icon: CalendarCheck },
    { label: "Próximos días", value: proximos.length, icon: Clock3 },
    { label: "Señas del mes", value: formatMoney(senasDelMes), icon: Wallet },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-micro">Panel del comercio</p>
          <h1 className="mt-1 text-3xl">Agenda</h1>
        </div>
        <Button className="rounded-full" onClick={() => setNuevoOpen(true)} disabled={!tenantId}>
          <Plus className="mr-1 h-4 w-4" />
          Nuevo turno
        </Button>
      </div>

      <NewAppointmentDialog
        open={nuevoOpen}
        onOpenChange={setNuevoOpen}
        tenant={merchant?.tenant}
        staff={staff}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["appointments", tenantId] })}
      />

      <SubscriptionBanner subscription={merchant?.subscription} />

      {staff.length ? (
        <div className="flex items-center gap-2">
          <label htmlFor="filtro-staff" className="text-sm text-muted-foreground">
            Ver agenda de
          </label>
          <select
            id="filtro-staff"
            value={staffFilter}
            onChange={(event) => setStaffFilter(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="todos">Todo el equipo</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.nombre}
              </option>
            ))}
            <option value="sin">Sin profesional asignado</option>
          </select>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{label}</span>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-2 font-display text-2xl tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {conflictos.length ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">
            {conflictos.length === 1 ? "Hay una seña cobrada" : `Hay ${conflictos.length} señas cobradas`} en turnos no confirmados (cancelados o con el horario ya tomado)
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {conflictos.map((a) => (
              <li key={a.id}>
                {a.cliente_nombre} ({a.cliente_telefono}) · {formatDateTime(a.fecha_hora_inicio)} · pago MP #{a.mp_payment_id}:
                revisá si corresponde reembolsar o reprogramar.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pendientes.length ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tenés {pendientes.length} turno{pendientes.length === 1 ? "" : "s"} esperando el pago de la seña.
        </p>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          Cargando agenda…
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-dashed border-destructive/40 px-5 py-10 text-center text-sm text-destructive">
          No pudimos cargar la agenda ({error?.message}).{" "}
          <button type="button" className="underline" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg">Hoy</h2>
              <span className="text-xs text-muted-foreground">{hoy.length} turnos</span>
            </div>
            <AppointmentList
              appointments={hoy}
              onChangeEstado={changeEstado}
              tenantName={merchant?.tenant?.nombre_comercio}
              emptyText="No tenés turnos para hoy."
            />
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg">Próximos días</h2>
              <span className="text-xs text-muted-foreground">{proximos.length} agendados</span>
            </div>
            <AppointmentList
              appointments={proximos.slice(0, 60)}
              onChangeEstado={changeEstado}
              tenantName={merchant?.tenant?.nombre_comercio}
              emptyText="Todavía no hay turnos agendados. Compartí tu link público para empezar a recibir reservas."
            />
          </section>
        </>
      )}
    </div>
  );
}