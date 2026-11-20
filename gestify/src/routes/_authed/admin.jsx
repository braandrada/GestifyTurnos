import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Plus, RefreshCw, Store, TrendingUp, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { Wordmark } from "@/components/marketing/MarketingNav";
import TenantsTable from "@/components/superadmin/TenantsTable";
import RegisterTenantModal from "@/components/superadmin/RegisterTenantModal";
import RecordPaymentModal from "@/components/superadmin/RecordPaymentModal";
import { provisionTenant, registerSubscriptionPayment, runPlatformAutomations, setSubscriptionState } from "@/lib/superadmin.functions";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authed/admin")({ component: SuperAdminDashboard });

const METODO_LABEL = { transferencia: "Transferencia", efectivo: "Efectivo", mercadopago: "Mercado Pago", otro: "Otro" };

function SuperAdminDashboard() {
  const { user, isLoadingAuth, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [running, setRunning] = useState(false);

  const isAdmin = user?.role === "admin";

  const tenantsQuery = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: () => base44.entities.Tenant.list({ sort: "created_date", limit: 200 }).then((page) => page.items),
    enabled: isAdmin,
  });
  const subscriptionsQuery = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: () => base44.entities.TenantSubscription.list({ limit: 200 }).then((page) => page.items),
    enabled: isAdmin,
  });
  const paymentsQuery = useQuery({
    queryKey: ["admin-payments"],
    queryFn: () => base44.entities.SubscriptionPayment.list({ sort: "-fecha_pago", limit: 100 }).then((page) => page.items),
    enabled: isAdmin,
  });

  const tenants = tenantsQuery.data || [];
  const subscriptions = subscriptionsQuery.data || [];
  const payments = paymentsQuery.data || [];
  const subsByTenant = Object.fromEntries(subscriptions.map((subscription) => [subscription.tenant_id, subscription]));
  const rows = tenants.map((tenant) => ({ tenant, subscription: subsByTenant[tenant.id] }));

  const monthKey = new Date().toISOString().slice(0, 7);
  const ingresosMes = payments
    .filter((payment) => String(payment.fecha_pago || "").slice(0, 7) === monthKey)
    .reduce((total, payment) => total + (Number(payment.monto) || 0), 0);
  const mrr = subscriptions
    .filter((subscription) => subscription.estado_suscripcion === "activa")
    .reduce((total, subscription) => total + (Number(subscription.precio_mensual) || 0), 0);
  const morosos = subscriptions.filter((subscription) => subscription.estado_suscripcion !== "activa").length;

  const refreshAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] }),
    ]);

  async function toggleEstado(tenant, subscription, estado) {
    try {
      await setSubscriptionState({ data: { tenant_id: tenant.id, estado_suscripcion: estado } });
      await refreshAll();
      toast.success(estado === "suspendida" ? `${tenant.nombre_comercio} suspendido` : `${tenant.nombre_comercio} reactivado`);
    } catch (error) {
      toast.error(error.message || "No pudimos cambiar el estado");
    }
  }

  async function runAutomations() {
    setRunning(true);
    try {
      const summary = await runPlatformAutomations();
      await refreshAll();
      toast.success(
        `Procesado: ${summary.expirados} turnos expirados, ${summary.vencidas} abonos vencidos, ${summary.recordatorios} recordatorios.`,
      );
    } catch (error) {
      toast.error(error.message || "No pudimos ejecutar las tareas");
    } finally {
      setRunning(false);
    }
  }

  if (isLoadingAuth) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Cargando…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl">Acceso restringido</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Este panel es solo para el administrador de la plataforma.
          </p>
          <Button className="mt-6 rounded-full" onClick={() => navigate({ to: "/panel" })}>
            Ir a mi panel
          </Button>
        </div>
      </div>
    );
  }

  const metrics = [
    { label: "Comercios", value: tenants.length, icon: Store },
    { label: "Suscripciones activas", value: subscriptions.filter((s) => s.estado_suscripcion === "activa").length, icon: Users },
    { label: "MRR", value: formatMoney(mrr), icon: TrendingUp },
    { label: "Cobrado este mes", value: formatMoney(ingresosMes), icon: Wallet },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Wordmark />
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
              Super admin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="rounded-full" onClick={runAutomations} disabled={running}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
              Procesar recordatorios
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-micro">Plataforma</p>
            <h1 className="mt-1 text-3xl">Comercios y suscripciones</h1>
          </div>
          <Button className="rounded-full" onClick={() => setRegisterOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Nuevo comercio
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-border bg-card px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{label}</span>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-2 font-display text-2xl tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        {morosos > 0 ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {morosos} comercio{morosos === 1 ? "" : "s"} con abono vencido o suspendido.
          </p>
        ) : null}

        <section>
          <h2 className="mb-3 text-lg">Comercios</h2>
          <TenantsTable rows={rows} onPay={(tenant, subscription) => setPaymentTarget({ tenant, subscription })} onToggle={toggleEstado} />
        </section>

        <section>
          <h2 className="mb-3 text-lg">Últimos pagos de abono</h2>
          {payments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
              Todavía no registraste pagos.
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {payments.slice(0, 12).map((payment) => (
                <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{payment.tenant_nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {METODO_LABEL[payment.metodo_pago] || payment.metodo_pago} · período {payment.periodo_cubierto || "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm tabular-nums">{formatMoney(payment.monto)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(payment.fecha_pago)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <RegisterTenantModal
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onSaved={async (data) => {
          const result = await provisionTenant({ data });
          await refreshAll();
          return result;
        }}
      />

      <RecordPaymentModal
        open={Boolean(paymentTarget)}
        onOpenChange={(open) => {
          if (!open) setPaymentTarget(null);
        }}
        tenant={paymentTarget?.tenant}
        subscription={paymentTarget?.subscription}
        onSaved={async (data) => {
          await registerSubscriptionPayment({ data });
          await refreshAll();
          toast.success("Pago registrado y vencimiento actualizado");
        }}
      />
    </div>
  );
}