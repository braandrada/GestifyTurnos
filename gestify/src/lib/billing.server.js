/** Token de Mercado Pago de la plataforma (el que cobra los abonos). Variable de entorno del servidor. */
export function platformToken() {
  const value = process.env.PLATFORM_MP_ACCESS_TOKEN;
  return value ? String(value) : null;
}
