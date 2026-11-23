import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck, Check, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const demoServices = [
  { name: "Corte + barba", meta: "45 min", price: "$12.000", deposit: "$4.000" },
  { name: "Color y brushing", meta: "90 min", price: "$28.000", deposit: "$8.000" },
];

const demoSlots = ["10:00", "11:30", "14:00", "16:30"];

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-accent/10 blur-3xl" />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div className="animate-rise">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Turnos con seña para locales que no quieren ausencias
          </span>
          <h1 className="mt-6 text-[42px] leading-[1.02] sm:text-6xl">
            Tu agenda llena,
            <br />
            la seña <em className="not-italic text-accent">cobrada</em>.
          </h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-muted-foreground">
            Un link público por local para reservar 24/7, seña con Mercado Pago y recordatorios automáticos por
            WhatsApp. Vos administrás servicios, horarios y tu suscripción desde un panel simple.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-full px-7">
              <Link to="/register" search={{ returnTo: "/panel" }}>
                Crear mi cuenta gratis
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-6">
              <a href="#como-funciona">Ver cómo funciona</a>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {["Sin instalar apps", "Multi-rubro", "Seña anti-ausencias"].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-primary" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative animate-rise [animation-delay:120ms]">
          <div className="absolute -left-6 top-10 hidden rotate-[-6deg] rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)] sm:block">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Seña acreditada
            </div>
            <p className="mt-1 font-display text-lg">$4.000</p>
          </div>
          <div className="rounded-[26px] border border-border bg-card p-5 shadow-[0_40px_80px_-50px_rgba(20,15,10,0.55)]">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="label-micro">Reserva online</p>
                <p className="mt-1 font-display text-xl">Estudio Norte</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Abierto
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {demoServices.map((service, index) => (
                <div
                  key={service.name}
                  className={`flex items-center justify-between rounded-xl border px-3.5 py-3 ${
                    index === 0 ? "border-primary/40 bg-primary/[0.04]" : "border-border"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">{service.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {service.meta} · seña {service.deposit}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">{service.price}</span>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <p className="label-micro">Jueves 19</p>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {demoSlots.map((slot, index) => (
                  <div
                    key={slot}
                    className={`rounded-lg border py-2 text-center text-sm tabular-nums ${
                      index === 1 ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                    }`}
                  >
                    {slot}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
              <span className="inline-flex items-center gap-2 text-xs text-secondary-foreground">
                <CalendarCheck className="h-4 w-4" />
                Congelá tu turno con la seña
              </span>
              <span className="text-xs font-medium">Continuar</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}