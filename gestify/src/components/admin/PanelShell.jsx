import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarDays, Clock, LogOut, PlugZap, Scissors, Wallet } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Wordmark } from "@/components/marketing/MarketingNav";
import { formatDate } from "@/lib/format";
import { LayoutGrid } from "lucide-react";

const NAV = [
  { to: "/panel", label: "Agenda", icon: CalendarDays },
  { to: "/panel/servicios", label: "Servicios", icon: Scissors },
  { to: "/panel/horarios", label: "Horarios", icon: Clock },
  { to: "/panel/integraciones", label: "Integraciones", icon: PlugZap },
  { to: "/panel/abono", label: "Mi abono", icon: Wallet },
];

const ESTADO_LABEL = { activa: "Abono al día", vencida: "Abono vencido", suspendida: "Cuenta suspendida" };

export default function PanelShell({ tenant, subscription, children }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { logout, user } = useAuth();
  const estado = subscription?.estado_suscripcion || "activa";
  const isAdmin = user?.role === "admin";

  const links = NAV.map(({ to, label, icon: Icon }) => {
    const active = pathname === to;
    return (
      <Link
        key={to}
        to={to}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
          active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    );
  });

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/50 px-4 py-6 lg:flex">
        <Link to="/panel" className="px-2">
          <Wordmark />
        </Link>
        <div className="mt-6 px-2">
          <p className="truncate text-sm font-medium">{tenant?.nombre_comercio}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">/{tenant?.slug}</p>
        </div>
        <nav className="mt-6 space-y-1">{links}</nav>
        {isAdmin ? (
          <Link
            to="/admin"
            className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LayoutGrid className="h-4 w-4" />
            Panel de plataforma
          </Link>
        ) : null}
        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-border bg-background px-3 py-3">
            <p className="text-xs font-medium">{ESTADO_LABEL[estado] || estado}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Vence {formatDate(subscription?.fecha_vencimiento_actual)}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl lg:hidden">
          <div className="flex items-center justify-between px-5 py-3">
            <Wordmark />
            <button type="button" onClick={logout} className="text-sm text-muted-foreground">
              Salir
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto px-4 pb-3">{links}</div>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}