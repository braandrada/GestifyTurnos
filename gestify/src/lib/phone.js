/**
 * Teléfonos para WhatsApp (se usa en el navegador y en el servidor).
 *
 * WhatsApp necesita el número internacional sin "+" ni espacios. Para Argentina los celulares van
 * como 54 9 <área sin 0> <número sin 15>, p. ej. "11 15 5555-5555" → "5491155555555".
 * Números con "+" o con otro código de país se respetan tal cual (solo dígitos).
 */
export function toWhatsAppNumber(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const international = raw.startsWith("+") || raw.startsWith("00");
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.startsWith("54")) {
    let national = digits.slice(2);
    if (national.startsWith("9")) national = national.slice(1);
    if (national.startsWith("0")) national = national.slice(1);
    national = stripMobilePrefix(national);
    return national.length === 10 ? `549${national}` : null;
  }

  if (international) return digits.length >= 8 && digits.length <= 15 ? digits : null;

  // Número local argentino: "011 15 5555-5555", "11 5555 5555", "0351 15 555 5555"…
  let national = digits.startsWith("0") ? digits.slice(1) : digits;
  national = stripMobilePrefix(national);
  return national.length === 10 ? `549${national}` : null;
}

// Quita el "15" de celular que va después del código de área (de 2 a 4 dígitos) cuando sobra.
function stripMobilePrefix(national) {
  if (national.length !== 12) return national;
  for (const areaLength of [2, 3, 4]) {
    if (national.slice(areaLength, areaLength + 2) === "15") {
      return national.slice(0, areaLength) + national.slice(areaLength + 2);
    }
  }
  return national;
}

/** Link wa.me con mensaje precargado. Devuelve null si el número no es válido. */
export function whatsAppLink(phone, text = "") {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
