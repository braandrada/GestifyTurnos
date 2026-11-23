import { describe, expect, it } from "vitest";
import { isValidDepositPayment } from "@/lib/mercadopago.server";

const appointment = { id: "11111111-1111-1111-1111-111111111111", monto_sena: 5000 };
const payment = (overrides = {}) => ({
  status: "approved",
  external_reference: appointment.id,
  currency_id: "ARS",
  transaction_amount: 5000,
  ...overrides,
});

describe("isValidDepositPayment", () => {
  it("acepta la seña aprobada, en pesos y por el monto", () => {
    expect(isValidDepositPayment(payment(), appointment)).toBe(true);
    expect(isValidDepositPayment(payment({ transaction_amount: 6000 }), appointment)).toBe(true);
  });

  it.each([
    ["pendiente", { status: "pending" }],
    ["rechazado", { status: "rejected" }],
    ["de otro turno", { external_reference: "22222222-2222-2222-2222-222222222222" }],
    ["en dólares", { currency_id: "USD" }],
    ["monto menor", { transaction_amount: 4999 }],
  ])("rechaza un pago %s", (_label, overrides) => {
    expect(isValidDepositPayment(payment(overrides), appointment)).toBe(false);
  });

  it("rechaza datos faltantes", () => {
    expect(isValidDepositPayment(null, appointment)).toBe(false);
    expect(isValidDepositPayment(payment(), null)).toBe(false);
  });
});
