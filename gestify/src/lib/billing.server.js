import { supabaseAdmin } from "@/lib/supabase.server";

/**
 * Token de Mercado Pago de la plataforma (el que cobra los abonos). Variable de entorno del servidor.
 * Nombre oficial: PLATFORM_MP_ACCESS_TOKEN. Se aceptan alias comunes por si se cargó con otro nombre.
 */
export function platformToken() {
  const value =
    process.env.PLATFORM_MP_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || "";
  const token = String(value).trim();
  return token || null;
}

/** Tipo de token sin revelarlo: "produccion" (APP_USR-), "prueba" (TEST-), "desconocido" o null. */
export function tokenKind(token) {
  if (!token) return null;
  if (token.startsWith("APP_USR-")) return "produccion";
  if (token.startsWith("TEST-")) return "prueba";
  return "desconocido";
}

/**
 * Precio por defecto del abono y días de prueba para comercios nuevos.
 * Fuente: tabla platform_settings (migración 006, editable por el super admin). Si no existe, variables de entorno.
 */
export async function platformDefaults() {
  const fallback = {
    precio_mensual_default: Math.max(Number(process.env.DEFAULT_MONTHLY_PRICE) || 0, 0),
    dias_prueba: Math.min(Math.max(Number(process.env.TRIAL_DAYS) || 14, 1), 90),
  };
  const { data, error } = await supabaseAdmin()
    .from("platform_settings")
    .select("precio_mensual_default, dias_prueba")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return fallback;
  return {
    precio_mensual_default: Number(data.precio_mensual_default) || 0,
    dias_prueba: Number(data.dias_prueba) || fallback.dias_prueba,
  };
}
