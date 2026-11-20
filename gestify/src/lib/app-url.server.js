import { getRequest } from "@tanstack/react-start/server";

/**
 * URL pública de la app para armar back_urls y notification_url de Mercado Pago.
 * Se toma de APP_URL (o de la request), NUNCA de lo que mande el navegador.
 */
export function appOrigin(request = getRequest()) {
  const fixed = String(process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/[^\s]+$/.test(fixed)) return fixed;
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  return `${proto}://${host}`;
}
