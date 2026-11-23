import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateTenantForm from "@/components/admin/CreateTenantForm";
import PanelShell from "@/components/admin/PanelShell";
import { useMerchant } from "@/hooks/useMerchant";

export const Route = createFileRoute("/_authed/panel")({ component: PanelLayout });

function PanelLayout() {
  const merchant = useMerchant();
  const navigate = useNavigate();

  useEffect(() => {
    if (merchant.data?.role === "super_admin") navigate({ to: "/admin", replace: true });
  }, [merchant.data, navigate]);

  if (merchant.isLoading || merchant.data?.role === "super_admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (merchant.isError || !merchant.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl">No pudimos cargar tu comercio</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {merchant.error?.message || "Revisá tu conexión e intentá de nuevo."}
          </p>
          <Button className="mt-6 rounded-full" onClick={() => merchant.refetch()} disabled={merchant.isFetching}>
            {merchant.isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  // Usuario nuevo (autoregistro): crea su propio comercio.
  if (merchant.data.role === "sin_comercio") return <CreateTenantForm />;

  return (
    <PanelShell tenant={merchant.data.tenant} subscription={merchant.data.subscription}>
      <Outlet />
    </PanelShell>
  );
}