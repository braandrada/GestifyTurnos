export const TZ = "America/Argentina/Buenos_Aires";
// Argentina no tiene horario de verano: el offset es fijo.
export const TZ_OFFSET = "-03:00";
const OFFSET_MS = 3 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' en hora local del local */
export function dateKeyOf(iso) {
  return new Date(new Date(iso).getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

/** 'HH:MM' en hora local del local */
export function timeKeyOf(iso) {
  return new Date(new Date(iso).getTime() - OFFSET_MS).toISOString().slice(11, 16);
}

export function toInstant(dateKey, timeKey) {
  const time = timeKey.length === 5 ? `${timeKey}:00` : timeKey;
  return new Date(`${dateKey}T${time}${TZ_OFFSET}`);
}

export function weekdayOf(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

export function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60000);
}

export function minutesOf(timeKey) {
  const [h, m] = String(timeKey).split(":").map(Number);
  return h * 60 + m;
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/** Intervalos ocupados por turnos que bloquean la agenda */
export function busyIntervals(appointments, now = new Date()) {
  return appointments
    .filter((appointment) => {
      if (appointment.estado === "confirmado") return true;
      if (appointment.estado !== "pendiente_pago") return false;
      return appointment.expira_pago_en && new Date(appointment.expira_pago_en) > now;
    })
    .map((appointment) => ({
      start: new Date(appointment.fecha_hora_inicio),
      end: new Date(appointment.fecha_hora_fin),
    }));
}

/**
 * Cruza los horarios del día con los turnos existentes y devuelve los inicios libres.
 */
export function buildSlots({ dateKey, durationMinutes, schedules, appointments, now = new Date() }) {
  const weekday = weekdayOf(dateKey);
  const busy = busyIntervals(appointments, now);
  const duration = Number(durationMinutes) || 30;
  const slots = [];

  schedules
    .filter((schedule) => Number(schedule.dia_semana) === weekday && schedule.activo !== false)
    .forEach((schedule) => {
      const dayStart = toInstant(dateKey, schedule.hora_inicio);
      const dayEnd = toInstant(dateKey, schedule.hora_fin);
      for (let start = dayStart.getTime(); start + duration * 60000 <= dayEnd.getTime(); start += duration * 60000) {
        const slotStart = new Date(start);
        const slotEnd = new Date(start + duration * 60000);
        if (slotStart <= now) continue;
        const taken = busy.some((interval) => overlaps(slotStart, slotEnd, interval.start, interval.end));
        if (taken) continue;
        slots.push({ start: slotStart.toISOString(), label: timeKeyOf(slotStart) });
      }
    });

  const unique = new Map(slots.map((slot) => [slot.start, slot]));
  return [...unique.values()].sort((a, b) => a.start.localeCompare(b.start));
}