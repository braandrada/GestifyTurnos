/**
 * Próximo vencimiento del abono: un mes calendario después del vencimiento actual (o de hoy, si ya venció).
 * No desborda: 31/01 → 28/02 (no 03/03).
 */
export function addOneMonth(iso, now = new Date()) {
  const base = iso && new Date(iso) > now ? new Date(iso) : new Date(now);
  const day = base.getUTCDate();
  base.setUTCDate(1);
  base.setUTCMonth(base.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(day, lastDay));
  return base.toISOString();
}
