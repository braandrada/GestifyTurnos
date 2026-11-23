import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppointmentList from "@/components/admin/AppointmentList";
import { unwrapDb } from "@/lib/db-errors";
import { dateKeyOf, minutesOf, timeKeyOf, toInstant, weekdayOf } from "@/lib/slots";
import { getSupabase } from "@/lib/supabase-browser";

const DAY_MS = 86400000;
const HOUR_PX = 56; // alto de una hora en la grilla
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const COLORES = {
  confirmado: "border-emerald-300 bg-emerald-50 text-emerald-900",
  pendiente_pago: "border-amber-300 bg-amber-50 text-amber-900",
};

// Fechas en hora de Argentina, trabajando siempre con dateKey "YYYY-MM-DD".
const addDays = (dateKey, days) => dateKeyOf(new Date(toInstant(dateKey, "12:00").getTime() + days * DAY_MS).toISOString());
const mondayOf = (dateKey) => addDays(dateKey, -((weekdayOf(dateKey) + 6) % 7));
const dayLabel = (dateKey) => Number(dateKey.slice(8, 10));
const monthLabel = (dateKey) =>
  toInstant(dateKey, "12:00").toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", month: "long", year: "numeric" });

/**
 * Agenda semanal (lunes a domingo). Turnos activos ubicados por hora; al tocar uno se ven sus acciones.
 * `filter(appointment)` aplica el filtro por profesional de la Agenda.
 */
export default function WeekCalendar({ tenantId, tenantName, filter, onChangeEstado }) {
  const today = dateKeyOf(new Date().toISOString());
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [selectedId, setSelectedId] = useState(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  const query = useQuery({
    queryKey: ["appointments-week", tenantId, weekStart],
    queryFn: async () =>
      unwrapDb(
        await getSupabase()
          .from("appointments")
          .select("*")
          .eq("tenant_id", tenantId)
          .in("estado", ["confirmado", "pendiente_pago"])
          .gte("fecha_hora_inicio", toInstant(weekStart, "00:00").toISOString())
          .lt("fecha_hora_inicio", toInstant(addDays(weekStart, 7), "00:00").toISOString())
          .order("fecha_hora_inicio", { ascending: true })
          .limit(1000),
      ),
    enabled: Boolean(tenantId),
  });

  const appointments = (query.data || []).filter(filter);
  const selected = appointments.find((appointment) => appointment.id === selectedId) || null;

  // Rango horario visible: 8 a 21 hs, ampliado si hay turnos fuera de ese rango.
  const { startHour, endHour } = useMemo(() => {
    let start = 8;
    let end = 21;
    for (const appointment of appointments) {
      start = Math.min(start, Math.floor(minutesOf(timeKeyOf(appointment.fecha_hora_inicio)) / 60));
      const endMinutes = minutesOf(timeKeyOf(appointment.fecha_hora_fin)) || 24 * 60;
      end = Math.max(end, Math.ceil(endMinutes / 60));
    }
    return { startHour: start, endHour: Math.min(end, 24) };
  }, [appointments]);
  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);

  function position(appointment) {
    const start = minutesOf(timeKeyOf(appointment.fecha_hora_inicio)) - startHour * 60;
    const duration = (new Date(appointment.fecha_hora_fin) - new Date(appointment.fecha_hora_inicio)) / 60000;
    return { top: (start / 60) * HOUR_PX, height: Math.max((duration / 60) * HOUR_PX - 2, 22) };
  }

  const nowMinutes = minutesOf(timeKeyOf(new Date().toISOString())) - startHour * 60;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg capitalize">{monthLabel(weekStart)}</p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Semana anterior" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={() => setWeekStart(mondayOf(today))}>
            Hoy
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Semana siguiente" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {query.isError ? (
        <div className="rounded-2xl border border-dashed border-destructive/40 px-5 py-10 text-center text-sm text-destructive">
          No pudimos cargar la semana ({query.error?.message}).{" "}
          <button type="button" className="underline" onClick={() => query.refetch()}>
            Reintentar
          </button>
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-2xl border border-border bg-card">
          {query.isFetching ? <Loader2 className="absolute right-3 top-3 z-20 h-4 w-4 animate-spin text-muted-foreground" /> : null}
          <div className="grid min-w-[720px] grid-cols-[48px_repeat(7,minmax(0,1fr))]">
            {/* encabezado */}
            <div className="sticky top-0 z-10 border-b border-border bg-card" />
            {days.map((dateKey, index) => (
              <div
                key={dateKey}
                className={`sticky top-0 z-10 border-b border-l border-border bg-card px-2 py-2 text-center text-xs ${
                  dateKey === today ? "font-semibold text-primary" : "text-muted-foreground"
                }`}
              >
                {DIAS_CORTOS[index]} <span className="tabular-nums">{dayLabel(dateKey)}</span>
              </div>
            ))}

            {/* columna de horas */}
            <div className="relative" style={{ height: hours.length * HOUR_PX }}>
              {hours.map((hour, index) => (
                <span key={hour} className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ top: index * HOUR_PX }}>
                  {index === 0 ? "" : `${String(hour).padStart(2, "0")}:00`}
                </span>
              ))}
            </div>

            {/* días */}
            {days.map((dateKey) => {
              const items = appointments.filter((appointment) => dateKeyOf(appointment.fecha_hora_inicio) === dateKey);
              return (
                <div key={dateKey} className={`relative border-l border-border ${dateKey === today ? "bg-primary/[0.03]" : ""}`} style={{ height: hours.length * HOUR_PX }}>
                  {hours.map((hour, index) => (
                    <div key={hour} className="absolute inset-x-0 border-t border-border/60" style={{ top: index * HOUR_PX }} />
                  ))}
                  {dateKey === today && nowMinutes > 0 && nowMinutes < hours.length * 60 ? (
                    <div className="absolute inset-x-0 z-[5] border-t-2 border-red-400" style={{ top: (nowMinutes / 60) * HOUR_PX }} />
                  ) : null}
                  {items.map((appointment) => {
                    const { top, height } = position(appointment);
                    return (
                      <button
                        key={appointment.id}
                        type="button"
                        onClick={() => setSelectedId(appointment.id === selectedId ? null : appointment.id)}
                        className={`absolute inset-x-0.5 z-[6] overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition ${
                          COLORES[appointment.estado] || COLORES.confirmado
                        } ${appointment.id === selectedId ? "ring-2 ring-primary" : "hover:brightness-95"}`}
                        style={{ top, height }}
                        title={`${timeKeyOf(appointment.fecha_hora_inicio)} ${appointment.cliente_nombre} · ${appointment.servicio_nombre || ""}`}
                      >
                        <span className="font-medium tabular-nums">{timeKeyOf(appointment.fecha_hora_inicio)}</span> {appointment.cliente_nombre}
                        {height > 34 ? (
                          <span className="block truncate opacity-80">
                            {appointment.servicio_nombre}
                            {appointment.staff_nombre ? ` · ${appointment.staff_nombre}` : ""}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-50" /> Confirmado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-amber-300 bg-amber-50" /> Esperando seña
        </span>
        <span>{appointments.length} turnos esta semana</span>
      </div>

      {selected ? (
        <AppointmentList
          appointments={[selected]}
          tenantName={tenantName}
          onChangeEstado={async (appointment, estado) => {
            await onChangeEstado(appointment, estado);
            query.refetch();
          }}
          emptyText=""
        />
      ) : (
        <p className="text-xs text-muted-foreground">Tocá un turno para ver sus datos y acciones.</p>
      )}
    </div>
  );
}
