import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import PanelShell from "@/components/admin/PanelShell";
import { useMerchant } from "@/hooks/useMerchant";
import { runMyAutomations } from "@/lib/merchant.functions";

export const Route = createFileRoute("/_authed/panel")({ component: PanelLayout });

function PanelLayout() {
  const merchant = useMerchant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (merchant.data?.role === "super_admin") navigate({ to: "/admin", replace: true });
  }, [merchant.data, navigate]);

  useEffect(() => {
    if (merchant.data?.role !== "comerciante") return;
    runMyAutomations()
      .then(() => queryClient.invalidateQueries({ queryKey: ["appointments"] }))
      .catch(() => {});
  }, [merchant.data?.role, queryClient]);

  if (merchant.isLoading || merchant.data?.role === "super_admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (merchant.data?.role === "sin_comercio") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl">Tu usuario no tiene un comercio asociado</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Pedile a la plataforma que vincule tu cuenta con el local. Si sos el administrador, entrá al panel de
            plataforma.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PanelShell tenant={merchant.data.tenant} subscription={merchant.data.subscription}>
      <Outlet />
    </PanelShell>
  );
}