import { BellRing, CalendarClock, CreditCard, LayoutDashboard, Link2, MessageCircle } from "lucide-react";

const steps = [
  {
    title: "El cliente elige",
    text: "Entra a turno.tu-local, selecciona servicio, día y horario libre según la duración real.",
  },
  {
    title: "Paga la seña",
    text: "Se bloquea el horario 15 minutos mientras Mercado Pago procesa la seña del turno.",
  },
  {
    title: "Vos atendés",
    text: "El turno queda confirmado, se avisa por WhatsApp y se recuerda antes del horario.",
  },
];

const features = [
  { icon: CreditCard, title: "Seña con Mercado Pago", text: "Cada comercio cobra con su propia cuenta. El turno se confirma solo cuando el pago se acredita." },
  { icon: CalendarClock, title: "Agenda sin superposiciones", text: "Los horarios se calculan contra la duración del servicio y los turnos ya tomados." },
  { icon: MessageCircle, title: "Recordatorios por WhatsApp", text: "Aviso al confirmar, recordatorio previo configurable y otro 2 horas antes con la dirección." },
  { icon: LayoutDashboard, title: "Panel del comercio", text: "Servicios, precios, seña, horarios semanales y agenda del día en un solo lugar." },
  { icon: Link2, title: "Un link por local", text: "Cada comercio tiene su dirección pública para compartir en Instagram o WhatsApp." },
  { icon: BellRing, title: "Suscripción controlada", text: "Estado del abono, vencimiento y pagos registrados, con suspensión automática del link." },
];

const rubros = ["Barberías", "Tatuadores", "Peluquerías", "Estética", "Consultorios", "Uñas", "Masajes", "Kinesiología"];

export function Rubros() {
  return (
    <section id="rubros" className="border-y border-border bg-secondary/60">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <p className="label-micro text-center">Hecho para cualquier local que trabaje con turnos</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          {rubros.map((rubro) => (
            <span key={rubro} className="rounded-full border border-border bg-background px-4 py-1.5 text-sm text-foreground/80">
              {rubro}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="como-funciona" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <div className="max-w-xl">
        <p className="label-micro">Cómo funciona</p>
        <h2 className="mt-3 text-4xl leading-tight sm:text-[42px]">Tres pasos entre el mensaje y el turno pago.</h2>
      </div>
      <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step.title} className="bg-card p-7">
            <span className="font-mono text-xs text-accent">0{index + 1}</span>
            <h3 className="mt-4 text-xl">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section id="incluye" className="border-t border-border bg-card/60">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-lg">
            <p className="label-micro">Qué incluye</p>
            <h2 className="mt-3 text-4xl leading-tight sm:text-[42px]">Todo lo que necesita tu local, sin planillas.</h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Configurás una vez y el sistema se ocupa del resto: disponibilidad, cobro de la seña, avisos y control
            del abono mensual.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="group rounded-2xl border border-border bg-background p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_24px_50px_-40px_rgba(20,15,10,0.6)]">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/[0.07] text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-lg">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}