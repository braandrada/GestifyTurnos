import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function Wordmark({ className = "" }) {
  return (
    <span className={`inline-flex items-baseline gap-1 font-display text-[22px] font-semibold tracking-tight ${className}`}>
      turno
      <span className="mb-[3px] h-1.5 w-1.5 rounded-full bg-accent" />
    </span>
  );
}

export default function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2 text-foreground">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#como-funciona" className="transition-colors hover:text-foreground">Cómo funciona</a>
          <a href="#rubros" className="transition-colors hover:text-foreground">Rubros</a>
          <a href="#incluye" className="transition-colors hover:text-foreground">Qué incluye</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/login" search={{ returnTo: "/panel" }}>Ingresar</Link>
          </Button>
          <Button asChild size="sm" className="rounded-full px-5">
            <Link to="/login" search={{ returnTo: "/panel" }}>Abrir panel</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}