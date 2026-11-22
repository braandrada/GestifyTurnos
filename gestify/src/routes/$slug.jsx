import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CalendarX2, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ServiceSelector from "@/components/public/ServiceSelector";
import TimeSlotPicker, { dayChips } from "@/components/public/TimeSlotPicker";
import DepositNoticeModal from "@/components/public/DepositNoticeModal";
import { getAvailability, getPublicTenant, createBooking } from "@/lib/booking.functions";
import { formatMoney } from "@/lib/format";
import { toWhatsAppNumber, whatsAppLink } from "@/lib/phone";

export const Route = createFileRoute("/$slug")({
  head: () => ({
    meta: [
      { title: "Reservar turno" },
      { name: "description", content: "Elegí servicio, día y horario para reservar tu turno online." },
    ],
  }),
  component: BookingPage,
});

const STEPS = ["Servicio", "Horario", "Tus datos"];

function BookingPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const days = useMemo(() => dayChips(14), []);

  const [step, setStep] = useState(0);
  const [service, setService] = useState(null);
  const [dateKey, setDateKey] = useState(days[0].dateKey);
  const [slot, setSlot] = useState(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const tenantQuery = useQuery({
    queryKey: ["public-tenant", slug],
    queryFn: () => getPublicTenant({ data: { slug } }),
  });

  const data = tenantQuery.data;
  const tenant = data?.tenant;

  const availability = useQuery({
    queryKey: ["availability", slug, service?.id, dateKey],
    queryFn: () => getAvailability({ data: { slug, serviceId: service.id, dateKey } }),
    enabled: Boolean(service?.id && dateKey),
  });

  const requierePago = Boolean(data?.deposito_online) && Number(service?.monto_sena) > 0;

  async function submit() {
    setError("");
    setSubmitting(true);
    try {
      const result = await createBooking({
        data: {
          slug,
          serviceId: service.id,
          startIso: slot.start,
          clienteNombre: nombre,
          clienteTelefono: telefono,
          origin: window.location.origin,
        },
      });
      if (result.initPoint) {
        window.location.href = result.initPoint;
        return;
      }
      navigate({ to: "/pago/$codigo", params: { codigo: result.codigo } });
    } catch (err) {
      const message = err?.message || "No pudimos crear la reserva. Probá de nuevo.";
      setError(message);
      setModalOpen(false);
      setSubmitting(false);
      // Si el horario se ocupó mientras completaba los datos: se refrescan los horarios y vuelve a elegir.
      if (/horario/i.test(message)) {
        setSlot(null);
        setStep(1);
        queryClient.invalidateQueries({ queryKey: ["availability", slug] });
      }
    }
  }

  function onConfirmClick(e) {
    e.preventDefault();
    if (nombre.trim().length < 2) {
      setError("Ingresá tu nombre y apellido");
      return;
    }
    if (!toWhatsAppNumber(telefono)) {
      setError("Revisá el teléfono: ingresalo con código de área, por ejemplo 11 5555 5555.");
      return;
    }
    if (requierePago) {
      setModalOpen(true);
      return;
    }
    submit();
  }

  if (tenantQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tenantQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-3xl">No pudimos cargar la agenda</h1>
          <p className="mt-3 text-sm text-muted-foreground">Revisá tu conexión e intentá de nuevo.</p>
          <Button className="mt-6 rounded-full" onClick={() => tenantQuery.refetch()} disabled={tenantQuery.isFetching}>
            {tenantQuery.isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-3xl">No encontramos este local</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Revisá el link que te compartieron. Puede que el comercio haya cambiado su dirección pública.
          </p>
          <Button asChild variant="outline" className="mt-6 rounded-full">
            <Link to="/">Volver al inicio</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!data.habilitado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <CalendarX2 className="h-6 w-6" />
          </span>
          <h1 className="mt-5 text-2xl">Turnos temporalmente inhabilitados</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            El sistema de turnos de {tenant.nombre_comercio} está en pausa en este momento. Comunicate con el local
            por WhatsApp para coordinar tu visita.
          </p>
          {tenant.telefono_whatsapp ? (
            <Button asChild className="mt-6 rounded-full">
              <a
                href={whatsAppLink(tenant.telefono_whatsapp, `Hola ${tenant.nombre_comercio}! Quería coordinar un turno.`) || "#"}
                target="_blank"
                rel="noreferrer"
              >
                Escribir por WhatsApp
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:py-16">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          turno
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <aside className="lg:sticky lg:top-10 lg:self-start">
            <p className="label-micro">{tenant.rubro || "Reserva online"}</p>
            <h1 className="mt-2 text-4xl leading-tight">{tenant.nombre_comercio}</h1>
            {tenant.direccion ? (
              <p className="mt-3 inline-flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                {tenant.direccion}
              </p>
            ) : null}

            <div className="mt-8 space-y-3 border-t border-border pt-6 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Servicio</span>
                <span className="text-right font-medium">{service?.nombre || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Horario</span>
                <span className="text-right font-medium">
                  {slot ? `${slot.label} hs` : "—"}
                  {service ? ` · ${service.duracion_minutos} min` : ""}
                </span>
              </div>
              {service ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Seña</span>
                  <span className="text-right font-medium">
                    {service.monto_sena > 0 ? formatMoney(service.monto_sena) : "Sin seña"}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex gap-2 rounded-2xl bg-secondary/70 px-4 py-3 text-xs leading-relaxed text-secondary-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>{tenant.politica_sena || "La seña asegura tu horario y se descuenta del total."}</p>
            </div>
          </aside>

          <section className="rounded-3xl border border-border bg-card p-6 shadow-[0_40px_80px_-60px_rgba(20,15,10,0.6)] sm:p-8">
            <div className="flex items-center gap-2">
              {STEPS.map((label, index) => (
                <div key={label} className="flex flex-1 items-center gap-2">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                      index <= step ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className={`hidden text-xs sm:block ${index === step ? "text-foreground" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                  {index < STEPS.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
                </div>
              ))}
            </div>

            <div className="mt-7">
              {step === 0 ? (
                <div>
                  <h2 className="text-xl">Elegí tu servicio</h2>
                  <div className="mt-4">
                    <ServiceSelector
                      services={data.services}
                      selectedId={service?.id}
                      onSelect={(next) => {
                        setService(next);
                        setSlot(null);
                        setStep(1);
                      }}
                    />
                  </div>
                  {data.services.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Este local todavía no cargó servicios disponibles.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {step === 1 ? (
                <div>
                  <h2 className="text-xl">Elegí día y horario</h2>
                  <div className="mt-4">
                    <TimeSlotPicker
                      days={days}
                      dateKey={dateKey}
                      onDateChange={(next) => {
                        setDateKey(next);
                        setSlot(null);
                      }}
                      slots={availability.data?.slots || []}
                      loading={availability.isLoading}
                      error={availability.isError}
                      onRetry={() => availability.refetch()}
                      selected={slot}
                      onSelect={(next) => {
                        setSlot(next);
                        setError("");
                      }}
                    />
                  </div>
                  {error ? (
                    <p role="alert" className="mt-4 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <div className="mt-6 flex items-center justify-between">
                    <Button variant="ghost" onClick={() => setStep(0)}>
                      <ArrowLeft className="mr-1 h-4 w-4" />
                      Volver
                    </Button>
                    <Button disabled={!slot} onClick={() => setStep(2)} className="rounded-full px-5">
                      Continuar
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <form onSubmit={onConfirmClick}>
                  <h2 className="text-xl">Tus datos</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Usamos tu WhatsApp para confirmar el turno y enviarte recordatorios.
                  </p>
                  <div className="mt-5 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="nombre">Nombre y apellido</Label>
                      <Input
                        id="nombre"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Camila Ferreyra"
                        autoComplete="name"
                        className="h-11"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="telefono">Teléfono (WhatsApp)</Label>
                      <Input
                        id="telefono"
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                        placeholder="11 5555 5555"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        className="h-11"
                        required
                      />
                    </div>
                  </div>

                  {error ? (
                    <p role="alert" className="mt-4 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}

                  <div className="mt-6 flex items-center justify-between">
                    <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                      <ArrowLeft className="mr-1 h-4 w-4" />
                      Volver
                    </Button>
                    <Button type="submit" disabled={submitting} className="rounded-full px-5">
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {requierePago ? "Continuar al pago" : "Confirmar turno"}
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      <DepositNoticeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onConfirm={submit}
        service={service}
        tenant={tenant}
        startIso={slot?.start}
        loading={submitting}
      />
    </div>
  );
}