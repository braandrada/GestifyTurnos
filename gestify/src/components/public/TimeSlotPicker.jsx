import { Loader2 } from "lucide-react";
import { TZ } from "@/lib/slots";

export function dayChips(count = 14) {
  return Array.from({ length: count }, (_, index) => {
    const iso = new Date(Date.now() + index * 86400000).toISOString();
    const date = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
    const dateKey = date.toISOString().slice(0, 10);
    return {
      dateKey,
      weekday: date.toLocaleDateString("es-AR", { timeZone: TZ, weekday: "short" }),
      day: date.toLocaleDateString("es-AR", { timeZone: TZ, day: "2-digit" }),
    };
  });
}

export default function TimeSlotPicker({ days, dateKey, onDateChange, slots, loading, selected, onSelect }) {
  return (
    <div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {days.map((day) => {
          const active = day.dateKey === dateKey;
          return (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => onDateChange(day.dateKey)}
              className={`flex min-w-[62px] flex-col items-center rounded-xl border px-3 py-2.5 transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              <span className="text-[11px] uppercase tracking-wide">{day.weekday}</span>
              <span className="mt-0.5 text-base font-medium tabular-nums">{day.day}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Buscando horarios libres…
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No quedan horarios libres este día. Probá con otra fecha.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((slot) => {
              const active = selected?.start === slot.start;
              return (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => onSelect(slot)}
                  className={`rounded-lg border py-2.5 text-sm tabular-nums transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}