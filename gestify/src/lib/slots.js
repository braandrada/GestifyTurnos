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

/**
 * Intervalos ocupados: turnos vivos + bloqueos manuales del comercio.
 * Misma regla que la base (public_get_busy_slots): un pendiente sin vencimiento cargado ocupa el horario.
 */
export function busyIntervals(appointments, now = new Date(), blocks = []) {
  const fromAppointments = appointments
    .filter((appointment) => {
      if (appointment.estado === "confirmado") return true;
      if (appointment.estado !== "pendiente_pago") return false;
      return !appointment.expira_pago_en || new Date(appointment.expira_pago_en) > now;
    })
    .map((appointment) => ({
      start: new Date(appointment.fecha_hora_inicio),
      end: new Date(appointment.fecha_hora_fin),
    }));
  const fromBlocks = blocks.map((block) => ({ start: new Date(block.inicio), end: new Date(block.fin) }));
  return [...fromAppointments, ...fromBlocks];
}

/**
 * Cada cuántos minutos se ofrece un inicio de turno. Servicios cortos avanzan de a su duración;
 * los largos, de a 30 min (si no, uno de 90 min solo ofrecería 9:00, 10:30, 12:00…).
 */
export function slotStepMinutes(durationMinutes) {
  return Math.min(Number(durationMinutes) || 30, 30);
}

/**
 * Cruza los horarios del día con los turnos y bloqueos existentes y devuelve los inicios libres.
 * `minStart`: no se ofrecen turnos que empiecen antes (anticipación mínima).
 */
export function buildSlots({ dateKey, durationMinutes, schedules, appointments, blocks = [], now = new Date(), minStart = now }) {
  const weekday = weekdayOf(dateKey);
  const busy = busyIntervals(appointments, now, blocks);
  const duration = Number(durationMinutes) || 30;
  const step = slotStepMinutes(duration);
  const slots = [];

  schedules
    .filter((schedule) => Number(schedule.dia_semana) === weekday && schedule.activo !== false)
    .forEach((schedule) => {
      const dayStart = toInstant(dateKey, schedule.hora_inicio);
      const dayEnd = toInstant(dateKey, schedule.hora_fin);
      for (let start = dayStart.getTime(); start + duration * 60000 <= dayEnd.getTime(); start += step * 60000) {
        const slotStart = new Date(start);
        const slotEnd = new Date(start + duration * 60000);
        if (slotStart <= now || slotStart < minStart) continue;
        const taken = busy.some((interval) => overlaps(slotStart, slotEnd, interval.start, interval.end));
        if (taken) continue;
        slots.push({ start: slotStart.toISOString(), label: timeKeyOf(slotStart) });
      }
    });

  const unique = new Map(slots.map((slot) => [slot.start, slot]));
  return [...unique.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Disponibilidad con profesionales.
 *
 *  - `usesStaff` false (comercio sin profesionales): igual que siempre, horarios del local y todos los turnos.
 *  - `usesStaff` true: se calcula por profesional elegible y se unen los resultados. Cada slot trae `staffIds`
 *    con los profesionales libres en ese horario (ordenados como `staff`).
 *    · Horarios: las franjas propias del profesional; si no tiene ninguna activa, las del local.
 *    · Turnos: los suyos + los "del local" (sin profesional), que por prudencia bloquean a todos.
 *    · Bloqueos: los del local entero + los suyos.
 *  - `staffId`: limita a ese profesional (si no es elegible, no hay slots).
 */
export function buildAvailability({
  dateKey,
  durationMinutes,
  schedules,
  appointments,
  blocks = [],
  usesStaff = false,
  staff = [],
  staffId = null,
  now = new Date(),
  minStart = now,
}) {
  const base = { dateKey, durationMinutes, now, minStart };
  const localSchedules = schedules.filter((schedule) => !schedule.staff_id);

  if (!usesStaff) {
    return buildSlots({ ...base, schedules: localSchedules, appointments, blocks }).map((slot) => ({ ...slot, staffIds: [] }));
  }

  const candidates = staffId ? staff.filter((member) => member.id === staffId) : staff;
  const byStart = new Map();

  for (const member of candidates) {
    const own = schedules.filter((schedule) => schedule.staff_id === member.id && schedule.activo !== false);
    const memberSlots = buildSlots({
      ...base,
      schedules: own.length ? own : localSchedules,
      appointments: appointments.filter((appointment) => !appointment.staff_id || appointment.staff_id === member.id),
      blocks: blocks.filter((block) => !block.staff_id || block.staff_id === member.id),
    });
    for (const slot of memberSlots) {
      const entry = byStart.get(slot.start) || { ...slot, staffIds: [] };
      entry.staffIds.push(member.id);
      byStart.set(slot.start, entry);
    }
  }

  return [...byStart.values()].sort((a, b) => a.start.localeCompare(b.start));
}
