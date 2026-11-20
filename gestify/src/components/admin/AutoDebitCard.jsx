import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, Repeat, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cancelSubscriptionPreapproval,
  createSubscriptionPreapproval,
  syncSubscriptionPreapproval,
} from "@/lib/billing.functions";
import { formatDate, formatMoney } from "@/lib/format";

export default function AutoDebitCard({ subscription, billingReady, onChanged }) {
  const createPreapproval = useServerFn(createSubscriptionPreapproval);
  const cancelPreapproval = useServerFn(cancelSubscriptionPreapproval);
  const syncPreapproval = useServerFn(syncSubscriptionPreapproval);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const authorized = subscription?.mp_estado === "authorized";
  const pending = Boolean(subscription?.mp_preapproval_id) && !authorized;

  useEffect(() => {
    if (!pending || !billingReady) return;
    let activo = true;
    syncPreapproval()
      .then((result) => {
        if (activo && result?.mp_estado === "authorized") onChanged();
      })
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, [pending, billingReady, syncPreapproval, onChanged]);

  async function activate() {
    setBusy(true);
    setError("");
    try {
      const { init_point } = await createPreapproval({ data: { origin: window.location.origin } });
      window.location.href = init_point;
    } catch (err) {
      setError(err?.message || "No pudimos abrir Mercado Pago. Probá de nuevo.");
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await cancelPreapproval();
      await onChanged();
    } catch (err) {
      setError(err?.message || "No pudimos cancelar el débito automático.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Repeat className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg">Débito automático con Mercado Pago</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Autorizás una vez y Mercado Pago debita {formatMoney(subscription?.precio_mensual)} todos los meses. El abono
            se renueva solo y no tenés que hacer nada más.
          </p>
        </div>
      </div>

      {!billingReady ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          La plataforma todavía no cargó su cuenta de Mercado Pago, así que el débito automático no está disponible.
          Mientras tanto, el abono se registra desde el panel de plataforma.
        </p>
      ) : authorized ? (
        <div className="mt-4 rounded-xl border border-primary/25 bg-primary/[0.05] px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Débito automático activo
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Próximo cobro el {formatDate(subscription?.fecha_vencimiento_actual)}
            {subscription?.mp_ultimo_pago ? ` · último cobro el ${formatDate(subscription.mp_ultimo_pago)}` : ""}
          </p>
        </div>
      ) : pending ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Estamos confirmando la autorización con Mercado Pago…
        </p>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Vas a salir a Mercado Pago para autorizar el cobro recurrente. Podés cancelarlo cuando quieras desde acá.
        </p>
      )}

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {billingReady ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {authorized ? (
            <Button variant="outline" className="rounded-full" disabled={busy} onClick={cancel}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Cancelar débito automático
            </Button>
          ) : (
            <Button className="rounded-full" disabled={busy || !(Number(subscription?.precio_mensual) > 0)} onClick={activate}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Activar débito automático
            </Button>
          )}
          {!(Number(subscription?.precio_mensual) > 0) ? (
            <span className="text-xs text-muted-foreground">Falta que la plataforma fije el precio de tu abono.</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}