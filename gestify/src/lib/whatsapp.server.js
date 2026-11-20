import { assertSafeWebhookUrl } from "@/lib/safe-url.server";
import { supabaseAdmin } from "@/lib/supabase.server";

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

/**
 * Envía un mensaje por el webhook de mensajería configurado por el comercio
 * (Evolution API / Twilio / Meta Cloud API a través de un adaptador propio).
 * Si el comercio no lo configuró, no hace nada. Nunca lanza: devuelve { sent, reason }.
 */
export async function sendWhatsAppMessage(tenantId, telefono, text) {
  if (!tenantId || !telefono) return { sent: false, reason: "missing" };

  const { data: integration } = await supabaseAdmin()
    .from("tenant_integrations")
    .select("whatsapp_api_url, whatsapp_token, whatsapp_activo")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!integration?.whatsapp_api_url || integration.whatsapp_activo === false) {
    return { sent: false, reason: "not_configured" };
  }

  let url;
  try {
    url = assertSafeWebhookUrl(integration.whatsapp_api_url);
  } catch {
    return { sent: false, reason: "unsafe_url" };
  }

  const headers = { "Content-Type": "application/json" };
  if (integration.whatsapp_token) headers.apikey = integration.whatsapp_token;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ number: normalizePhone(telefono), text, messaging_product: "whatsapp" }),
      signal: AbortSignal.timeout(8000),
    });
    return { sent: response.ok };
  } catch {
    return { sent: false, reason: "request_failed" };
  }
}
