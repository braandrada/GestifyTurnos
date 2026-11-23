import { describe, expect, it } from "vitest";
import { addOneMonth } from "@/lib/billing-dates";

const now = new Date("2026-01-10T12:00:00Z");

describe("addOneMonth", () => {
  it("suma un mes al vencimiento vigente", () => {
    expect(addOneMonth("2026-01-15T03:00:00Z", now)).toBe("2026-02-15T03:00:00.000Z");
  });
  it("no desborda a fin de mes", () => {
    expect(addOneMonth("2026-01-31T03:00:00Z", now)).toBe("2026-02-28T03:00:00.000Z");
    expect(addOneMonth("2028-01-31T03:00:00Z", now)).toBe("2028-02-29T03:00:00.000Z"); // bisiesto
  });
  it("si ya venció, cuenta desde hoy", () => {
    expect(addOneMonth("2025-12-01T03:00:00Z", now)).toBe("2026-02-10T12:00:00.000Z");
    expect(addOneMonth(null, now)).toBe("2026-02-10T12:00:00.000Z");
  });
  it("cruza de año", () => {
    expect(addOneMonth("2026-12-20T03:00:00Z", now)).toBe("2027-01-20T03:00:00.000Z");
  });
});
