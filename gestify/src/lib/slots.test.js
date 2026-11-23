import { describe, expect, it } from "vitest";
import { buildAvailability, buildSlots, dateKeyOf, slotStepMinutes, toInstant, weekdayOf } from "@/lib/slots";

// Martes 1/12/2026; "ahora" es el día anterior al mediodía (hora de Argentina).
const dateKey = "2026-12-01";
const now = new Date("2026-11-30T12:00:00-03:00");
const local = [{ dia_semana: 2, hora_inicio: "09:00:00", hora_fin: "13:00:00", activo: true, staff_id: null }];
const at = (time) => toInstant(dateKey, time).toISOString();
const appt = (from, to, extra = {}) => ({ estado: "confirmado", fecha_hora_inicio: at(from), fecha_hora_fin: at(to), ...extra });
const labels = (slots) => slots.map((slot) => slot.label);

describe("zona horaria (Argentina, UTC-3 fijo)", () => {
  it("dateKeyOf usa la fecha local, no la UTC", () => {
    // 01:30 de Argentina = 04:30 UTC del mismo día; 23:30 AR = 02:30 UTC del día siguiente
    expect(dateKeyOf("2026-12-01T04:30:00Z")).toBe("2026-12-01");
    expect(dateKeyOf("2026-12-02T02:30:00Z")).toBe("2026-12-01");
  });
  it("weekdayOf", () => {
    expect(weekdayOf("2026-12-01")).toBe(2);
  });
});

describe("buildSlots", () => {
  const run = (options) => labels(buildSlots({ dateKey, schedules: local, appointments: [], now, ...options }));

  it("servicios largos avanzan de a 30 min", () => {
    expect(slotStepMinutes(90)).toBe(30);
    expect(slotStepMinutes(20)).toBe(20);
    expect(run({ durationMinutes: 90 })).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
  });

  it("un turno confirmado ocupa su rango", () => {
    expect(run({ durationMinutes: 60, appointments: [appt("10:00", "11:00")] })).toEqual([
      "09:00",
      "11:00",
      "11:30",
      "12:00",
    ]);
  });

  it("un pendiente sin vencimiento ocupa; uno vencido libera", () => {
    const sinVencimiento = appt("09:00", "10:00", { estado: "pendiente_pago", expira_pago_en: null });
    const vencido = appt("09:00", "10:00", { estado: "pendiente_pago", expira_pago_en: "2026-11-30T11:00:00-03:00" });
    expect(run({ durationMinutes: 60, appointments: [sinVencimiento] })[0]).toBe("10:00");
    expect(run({ durationMinutes: 60, appointments: [vencido] })[0]).toBe("09:00");
  });

  it("cancelados y expirados no ocupan", () => {
    const turnos = [appt("09:00", "10:00", { estado: "cancelado" }), appt("10:00", "11:00", { estado: "expirado" })];
    expect(run({ durationMinutes: 60, appointments: turnos })[0]).toBe("09:00");
  });

  it("los bloqueos sacan horarios", () => {
    expect(run({ durationMinutes: 60, blocks: [{ inicio: at("10:00"), fin: at("13:00") }] })).toEqual(["09:00"]);
  });

  it("respeta la anticipación mínima", () => {
    const ahora = new Date("2026-12-01T09:50:00-03:00");
    const minStart = new Date("2026-12-01T10:05:00-03:00");
    expect(run({ durationMinutes: 60, now: ahora, minStart })[0]).toBe("10:30");
  });

  it("un día sin franjas (franco) no tiene horarios", () => {
    expect(buildSlots({ dateKey: "2026-12-02", schedules: local, appointments: [], now, durationMinutes: 30 })).toEqual([]);
  });

  it("el turno no puede pasarse del cierre", () => {
    expect(run({ durationMinutes: 240 })).toEqual(["09:00"]);
    expect(run({ durationMinutes: 300 })).toEqual([]);
  });
});

describe("buildAvailability con profesionales", () => {
  const ana = { id: "a" };
  const beto = { id: "b" };
  const base = { dateKey, now, durationMinutes: 60, schedules: [{ ...local[0], hora_fin: "11:00:00" }], appointments: [] };
  const run = (options) =>
    buildAvailability({ ...base, usesStaff: true, staff: [ana, beto], ...options }).map(
      (slot) => `${slot.label}[${slot.staffIds.join("")}]`,
    );

  it("sin profesionales funciona como local único", () => {
    const slots = buildAvailability({ ...base, appointments: [appt("09:00", "10:00")] });
    expect(labels(slots)).toEqual(["10:00"]);
  });

  it("si Ana está ocupada, Beto sigue disponible", () => {
    expect(run({ appointments: [appt("09:00", "10:00", { staff_id: "a" })] })).toEqual(["09:00[b]", "09:30[b]", "10:00[ab]"]);
  });

  it("un turno sin profesional bloquea a todos", () => {
    expect(run({ appointments: [appt("09:00", "10:00")] })).toEqual(["10:00[ab]"]);
  });

  it("bloqueo de un solo profesional", () => {
    expect(run({ blocks: [{ staff_id: "b", inicio: at("09:00"), fin: at("11:00") }] })).toEqual(["09:00[a]", "09:30[a]", "10:00[a]"]);
  });

  it("horarios propios reemplazan a los del local", () => {
    const propio = { dia_semana: 2, hora_inicio: "10:00:00", hora_fin: "12:00:00", activo: true, staff_id: "b" };
    expect(run({ schedules: [...base.schedules, propio] })).toEqual([
      "09:00[a]",
      "09:30[a]",
      "10:00[ab]",
      "10:30[b]",
      "11:00[b]",
    ]);
  });

  it("filtrar por profesional", () => {
    expect(run({ staffId: "b", appointments: [appt("09:00", "10:00", { staff_id: "b" })] })).toEqual(["10:00[b]"]);
  });

  it("sin profesionales elegibles no hay horarios", () => {
    expect(run({ staff: [] })).toEqual([]);
  });
});
