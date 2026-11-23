import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import TimeSlotPicker, { dayChips } from "@/components/public/TimeSlotPicker";
import { cancelBooking, getAvailability, rescheduleBooking } from "@/lib/booking.functions";
import { formatDateTime } from "@/lib/format";

/**
 * Reprogramar o cancelar desde el link del turno. El servidor vuelve a validar todo
 * (estado, plazo, horario libre); acá solo se muestra lo que corresponde.
 */
export default function ManageBooking({ booking }) {
  const queryClient = useQueryClient();
  const days = useMemo(() => dayChips(14), []);
  const [mode, setMode] = useState(null); // null | "reprogramar" | "cancelar"
  const [dateKey, setDateKey] = useState(days[0].dateKey);
  const [slot, setSlot] = useState(null);
  const [mismoProfesional, setMismoProfesional] = useState(Boolean(booking.staff_id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const staffId = mismoProfesional ? booking.staff_id : null;
  const availability = useQuery({
    queryKey: ["availability-reprogramar", booking.codigo, dateKey, staffId],
    queryFn: () =>
      getAvailability({
        data: { slug: booking.comercio.slug, serviceId: booking.service_id, dateKey, staffId, codigo: booking.codigo },
      }),
    enabled: mode === "reprogramar" && Boolean(booking.service_id),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["booking-status", booking.codigo] });

  async function run(action, message) {
    setBusy(true);
    setError("");
    try {
      await action();
      setDone(message);
      setMode(null);
      setSlot(null);
      await refresh();
    } catch (err) {
      setError(err?.message || "No pudimos hacer el cambio. Probá de nuevo.");
      if (/horario/i.test(err?.message || "")) {
        setSlot(null);
        availability.refetch();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!booking.puede_cancelar && !booking.puede_reprogramar) {
    return booking.estado === "confirmado" ? (
      <p className="mt-4 text-xs text-muted-foreground">
        Para cambios a menos de {booking.limite_cambios_horas} horas del turno, escribile al local por WhatsApp.
      </p>
    ) : null;
  }

  return (
    <div className="mt-6 border-t border-border pt-5">
      {done ? (
        <p role="status" className="mb-3 rounded-xl bg-primary/[0.06] px-4 py-3 text-sm text-primary">
          {done}
        </p>
      ) : null}

      {mode === null ? (
        <div className="flex flex-wrap gap-2">
          {booking.puede_reprogramar ? (
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => (setMode("reprogramar"), setDone(""), setError(""))}>
              <CalendarClock className="mr-1 h-4 w-4" />
              Cambiar día u horario
            </Button>
          ) : null}
          {booking.puede_cancelar ? (
            <Button
              variant="ghost"
              className="flex-1 rounded-full text-muted-foreground"
              onClick={() => (setMode("cancelar"), setDone(""), setError(""))}
            >
              <X className="mr-1 h-4 w-4" />
              Cancelar turno
            </Button>
          ) : null}
        </div>
      ) : null}

      {mode === "cancelar" ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.04] p-4">
          <p className="text-sm font-medium">¿Cancelar tu turno del {formatDateTime(booking.fecha_hora_inicio)}?</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            El horario queda libre para otra persona.
            {booking.monto_sena > 0
              ? ` Sobre la seña rige la política del local: ${booking.comercio.politica_sena || "consultala por WhatsApp."}`
              : ""}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="destructive"
              className="rounded-full"
              disabled={busy}
              onClick={() => run(() => cancelBooking({ data: { codigo: booking.codigo } }), "Listo, tu turno quedó cancelado.")}
            >
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Sí, cancelar
            </Button>
            <Button variant="ghost" className="rounded-full" disabled={busy} onClick={() => setMode(null)}>
              Volver
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "reprogramar" ? (
        <div>
          <p className="text-sm font-medium">Elegí el nuevo día y horario</p>
          {booking.staff_id && booking.staff_nombre ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={mismoProfesional}
                onChange={(event) => {
                  setMismoProfesional(event.target.checked);
                  setSlot(null);
                }}
              />
              Solo con {booking.staff_nombre}
            </label>
          ) : null}
          <div className="mt-3">
            <TimeSlotPicker
              days={days}
              dateKey={dateKey}
              onDateChange={(next) => {
                setDateKey(next);
                setSlot(null);
              }}
              slots={availability.data?.slots || []}
              loading={availability.isLoading}
              error={availability.isError}
              onRetry={() => availability.refetch()}
              selected={slot}
              onSelect={setSlot}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              className="rounded-full"
              disabled={!slot || busy}
              onClick={() =>
                run(
                  () => rescheduleBooking({ data: { codigo: booking.codigo, startIso: slot.start, staffId } }),
                  "Listo, tu turno quedó reprogramado.",
                )
              }
            >
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {slot ? `Confirmar ${slot.label} hs` : "Elegí un horario"}
            </Button>
            <Button variant="ghost" className="rounded-full" disabled={busy} onClick={() => setMode(null)}>
              Volver
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
