import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/crypto.server";

/**
 * Valida el header x-signature de las notificaciones de Mercado Pago:
 *   x-signature: ts=...,v1=<hmac sha256>
 *   manifest firmado: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * `dataId` es el parámetro `data.id` de la URL. `secret` es la clave secreta de Webhooks de tu aplicación.
 */
export function verifyMpSignature({ request, dataId, secret }) {
  const header = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(
    header
      .split(",")
      .map((piece) => piece.trim().split("="))
      .filter((pair) => pair.length === 2),
  );
  if (!parts.ts || !parts.v1 || !dataId || !secret) return false;

  const id = /^[a-z0-9]+$/i.test(String(dataId)) ? String(dataId).toLowerCase() : String(dataId);
  const manifest = `id:${id};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  return safeEqual(expected, parts.v1);
}
