import { useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMerchant } from "@/hooks/useMerchant";
import SubscriptionBanner from "@/components/admin/SubscriptionBanner";
import AutoDebitCard from "@/components/admin/AutoDebitCard";
import { unwrapDb } from "@/lib/db.client";
import { formatDate, formatMoney } from "@/lib/format";
import { getSupabase } from "@/lib/supabase.client";

export const Route = createFileRoute("/_authed/panel/abono")({ component: AbonoPage });

const METODOS = { transferencia: "Transferencia", efectivo: "Efectivo", mercadopago: "Mercado Pago", otro: "Otro" };

function AbonoPage() {
  const { data: merchant } = useMerchant();
  const queryClient = useQueryClient();
  const tenantId = merchant?.tenant?.id;

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["merchant-access"] }),
    [queryClient],
  );

  const { data: pagos = [], isLoading } = useQuery({
    queryKey: ["subscription-payments", tenantId],
    queryFn: async () =>
      unwrapDb(
        await getSupabase()
          .from("subscription_payments")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("fecha_pago", { ascending: false })
          .limit(6),
      ),
    enabled: Boolean(tenantId),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="label-micro">Facturación</p>
        <h1 className="mt-1 text-3xl">Mi abono</h1>
      </div>

      <SubscriptionBanner subscription={merchant?.subscription} />

      <AutoDebitCard
        subscription={merchant?.subscription}
        billingReady={Boolean(merchant?.billingReady)}
        onChanged={refresh}
      />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg">Últimos cobros</h2>
          <span className="text-xs text-muted-foreground">{pagos.length} registrados</span>
        </div>
        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
            Cargando cobros…
          </div>
        ) : pagos.length ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="divide-y divide-border">
              {pagos.map((pago) => (
                <div key={pago.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">{formatMoney(pago.monto)}</p>
                    <p className="text-xs text-muted-foreground">
                      {METODOS[pago.metodo_pago] || pago.metodo_pago} · período {pago.periodo_cubierto || "—"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(pago.fecha_pago)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            Todavía no hay cobros registrados para tu comercio.
          </div>
        )}
      </section>
    </div>
  );
}