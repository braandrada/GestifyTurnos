/**
 * El comercio pega la URL de su proveedor de WhatsApp y nuestro servidor le hace un POST.
 * Para no convertirnos en un proxy hacia redes internas (SSRF) solo se aceptan URLs https
 * que no apunten a localhost ni a rangos privados.
 * Límite conocido: no resuelve DNS (no cubre dominios públicos que apunten a una IP privada).
 */
export function assertSafeWebhookUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error("La URL del webhook no es válida");
  }
  if (url.protocol !== "https:") throw new Error("La URL del webhook debe empezar con https://");

  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(0|10|127)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]" ||
    host.startsWith("[f");
  if (blocked) throw new Error("La URL del webhook apunta a una dirección no permitida");
  return url.toString();
}
