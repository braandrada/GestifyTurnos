const MP_API = "https://api.mercadopago.com";

/**
 * Crea una preferencia de Checkout Pro con el access token del comercio.
 */
export async function createPreference({ accessToken, tenant, service, appointment, origin }) {
  const body = {
    items: [
      {
        id: String(service.id),
        title: `Seña · ${service.nombre}`,
        description: `${tenant.nombre_comercio} · turno con seña`,
        quantity: 1,
        currency_id: "ARS",
        unit_price: Number(service.monto_sena),
      },
    ],
    payer: { name: appointment.cliente_nombre },
    external_reference: appointment.id,
    notification_url: `${origin}/api/mp-webhook?tenant=${tenant.id}`,
    back_urls: {
      success: `${origin}/pago/${appointment.codigo_publico}?estado=ok`,
      pending: `${origin}/pago/${appointment.codigo_publico}?estado=pendiente`,
      failure: `${origin}/pago/${appointment.codigo_publico}?estado=error`,
    },
    auto_return: "approved",
    statement_descriptor: String(tenant.nombre_comercio || "Turno").slice(0, 22),
    expires: true,
    expiration_date_to: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };

  const response = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.message || "Mercado Pago rechazó la creación de la preferencia");
  }
  return { id: json.id, init_point: json.init_point || json.sandbox_init_point };
}

/**
 * ¿Este pago de Mercado Pago es la seña aprobada de este turno? Única fuente de verdad para el webhook
 * y para la pantalla de estado: aprobado, en pesos, con la referencia del turno y monto que cubra la seña.
 */
export function isValidDepositPayment(payment, appointment) {
  if (!payment || !appointment) return false;
  if (payment.status !== "approved") return false;
  if (String(payment.external_reference || "") !== String(appointment.id)) return false;
  if (payment.currency_id && payment.currency_id !== "ARS") return false;
  return Number(payment.transaction_amount) + 0.001 >= Number(appointment.monto_sena);
}

/** Busca la seña aprobada de un turno (cuando el cliente vuelve de MP antes de que llegue el webhook). */
export async function findApprovedPayment({ accessToken, appointment }) {
  const url = `${MP_API}/v1/payments/search?external_reference=${encodeURIComponent(appointment.id)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const json = await response.json().catch(() => ({}));
  const approved = (json.results || []).find((payment) => isValidDepositPayment(payment, appointment));
  return approved ? { id: String(approved.id), status: approved.status } : null;
}

export async function getPayment({ accessToken, paymentId }) {
  const response = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

/**
 * Suscripción recurrente (preapproval) del abono mensual, con la cuenta de la plataforma.
 */
export async function createPreapproval({ accessToken, tenant, subscription, origin }) {
  const body = {
    reason: `Abono mensual · Turno · ${tenant.nombre_comercio}`,
    external_reference: subscription.id,
    payer_email: tenant.owner_email,
    back_url: `${origin}/panel/abono?mp=ok`,
    notification_url: `${origin}/api/mp-suscripciones?tenant=${tenant.id}`,
    status: "pending",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: Number(subscription.precio_mensual),
      currency_id: "ARS",
    },
  };

  const response = await fetch(`${MP_API}/preapproval`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.message || "Mercado Pago rechazó el débito automático");
  }
  return { id: String(json.id), status: json.status || "pending", init_point: json.init_point };
}

export async function getPreapproval({ accessToken, preapprovalId }) {
  const response = await fetch(`${MP_API}/preapproval/${encodeURIComponent(preapprovalId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

export async function cancelPreapproval({ accessToken, preapprovalId }) {
  const response = await fetch(`${MP_API}/preapproval/${encodeURIComponent(preapprovalId)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

export async function getAuthorizedPayment({ accessToken, paymentId }) {
  const response = await fetch(`${MP_API}/authorized_payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

/** Verifica que un access token sea válido (devuelve el usuario de MP o null). */
export async function getMpUser({ accessToken }) {
  const response = await fetch(`${MP_API}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}
