import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/marketing/MarketingNav";

export default function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-8 rounded-3xl bg-primary px-7 py-10 text-primary-foreground sm:px-10 md:flex-row md:items-center">
          <div className="max-w-md">
            <h2 className="text-3xl leading-tight sm:text-4xl">Sumá tu local y empezá a tomar turnos hoy.</h2>
            <p className="mt-3 text-sm text-primary-foreground/70">
              Creá tu cuenta, cargá tus servicios y compartí tu link. Empezás con un período de prueba sin cargo.
            </p>
          </div>
          <Button asChild size="lg" variant="secondary" className="rounded-full px-6">
            <Link to="/register" search={{ returnTo: "/panel" }}>
              Crear mi cuenta
              <ArrowUpRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="mt-10 flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Wordmark className="text-foreground" />
          <p>Turnos, señas y recordatorios para locales de Argentina.</p>
        </div>
      </div>
    </footer>
  );
}