import { slugify } from "@/lib/format";

// Coinciden con rutas de la app; misma lista que la constraint tenants_slug_reservado (migración 004).
export const RESERVED_SLUGS = new Set([
  "admin", "panel", "login", "register", "mfa", "api", "pago", "auth",
  "forgot-password", "reset-password", "www", "app", "assets", "static",
]);

/** Normaliza un slug y explica por qué no sirve (null si está bien). */
export function checkSlug(value) {
  const slug = slugify(value);
  if (!slug || slug.length < 2) return { slug, error: "La dirección tiene que tener al menos 2 letras o números." };
  if (RESERVED_SLUGS.has(slug)) return { slug, error: `"${slug}" es una dirección reservada. Elegí otra.` };
  return { slug, error: null };
}
