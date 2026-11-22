import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Clock3, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useMerchant } from "@/hooks/useMerchant";
import AppointmentList from "@/components/admin/AppointmentList";
import SubscriptionBanner from "@/components/admin/SubscriptionBanner";
import { unwrapDb } from "@/lib/db.client";
import { getSupabase } from "@/lib/supabase.client";
import { dateKeyOf } from "@/lib/slots";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authed/panel/")({ component: Dashboard });

function Dashboard() {
  const { data: merchant } = useMerchant();
  const tenantId = merchant?.tenant?.id;
  const queryClient = useQueryClient();

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["appointments", tenantId],
    // Turnos del mes en curso en adelante: alcanza para "hoy", "próximos" y "señas del mes".
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      return unwrapDb(
        await getSupabase()
          .from("appointments")
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
    try {
      unwrapDb(await getSupabase().from("appointments").update({ estado }).eq("id", appointment.id));
      queryClient.invalidateQueries({ queryKey: ["appointments", tenantId] });
    } catch (error) {
      toast.error(error.message);
    }
  }

  const now = new Date();
  const todayKey = dateKeyOf(now.toISOString());
  const activos = appointments.filter((a) => a.estado === "confirmado" || a.estado === "pendiente_pago");
  const proximos = activos
    .filter((a) => new Date(a.fecha_hora_inicio) >= now)
    .sort((a, b) => a.fecha_hora_inicio.localeCompare(b.fecha_hora_inicio));
  const hoy = activos.filter((a) => dateKeyOf(a.fecha_hora_inicio) === todayKey);
  const pendientes = activos.filter((a) => a.estado === "pendiente_pago");
  const senasDelMes = appointments
    .filter((a) => a.estado === "confirmado" && a.fecha_hora_inicio.slice(0, 7) === todayKey.slice(0, 7))
    .reduce((total, a) => total + (Number(a.monto_sena) || 0), 0);

  const stats = [
    { label: "Turnos hoy", value: hoy.length, icon: CalendarCheck },
    { label: "Próximos", value: proximos.length, icon: Clock3 },
    { label: "Señas del mes", value: formatMoney(senasDelMes), icon: Wallet },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="label-micro">Panel del comercio</p>
        <h1 className="mt-1 text-3xl">Agenda</h1>
      </div>

      <SubscriptionBanner subscription={merchant?.subscription} />

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

      {pendientes.length ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tenés {pendientes.length} turno{pendientes.length === 1 ? "" : "s"} esperando el pago de la seña.
        </p>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg">Próximos turnos</h2>
          <span className="text-xs text-muted-foreground">{proximos.length} agendados</span>
        </div>
        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
            Cargando agenda…
          </div>
        ) : (
          <AppointmentList
            appointments={proximos.slice(0, 60)}
            onChangeEstado={changeEstado}
            emptyText="Todavía no hay turnos agendados. Compartí tu link público para empezar a recibir reservas."
          />
        )}
      </section>
    </div>
  );
}