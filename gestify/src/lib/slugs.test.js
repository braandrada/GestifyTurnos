import { describe, expect, it } from "vitest";
import { checkSlug } from "@/lib/slugs";

describe("checkSlug", () => {
  it("normaliza nombres con tildes y espacios", () => {
    expect(checkSlug("Barbería Don Pepe")).toEqual({ slug: "barberia-don-pepe", error: null });
  });
  it.each(["admin", "Panel", "api", "login"])("rechaza la dirección reservada %s", (value) => {
    expect(checkSlug(value).error).toMatch(/reservada/);
  });
  it("rechaza vacíos o de un carácter", () => {
    expect(checkSlug("").error).toBeTruthy();
    expect(checkSlug("!!").error).toBeTruthy();
    expect(checkSlug("a").error).toBeTruthy();
  });
});
