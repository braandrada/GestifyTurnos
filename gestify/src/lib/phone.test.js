import { describe, expect, it } from "vitest";
import { toWhatsAppNumber, whatsAppLink } from "@/lib/phone";

describe("toWhatsAppNumber", () => {
  it.each([
    ["11 5555 5555", "5491155555555"],
    ["011 15 5555-5555", "5491155555555"],
    ["+54 9 11 5555 5555", "5491155555555"],
    ["+54 11 5555 5555", "5491155555555"],
    ["5491155555555", "5491155555555"],
    ["0351 15 555 5555", "5493515555555"],
    ["351 555 5555", "5493515555555"],
    ["2944 15 55 5555", "5492944555555"],
    ["+1 415 555 2671", "14155552671"],
  ])("%s → %s", (input, expected) => {
    expect(toWhatsAppNumber(input)).toBe(expected);
  });

  it.each(["", "123", "abc", null, undefined, "11 5555"])("rechaza %s", (input) => {
    expect(toWhatsAppNumber(input)).toBeNull();
  });
});

describe("whatsAppLink", () => {
  it("arma el link con el texto codificado", () => {
    expect(whatsAppLink("11 5555 5555", "Hola & chau")).toBe("https://wa.me/5491155555555?text=Hola%20%26%20chau");
  });
  it("devuelve null con un número inválido", () => {
    expect(whatsAppLink("123", "hola")).toBeNull();
  });
});
