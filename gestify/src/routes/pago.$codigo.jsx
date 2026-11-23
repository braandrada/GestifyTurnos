import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarX2, Clock, Loader2, MapPin, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import ManageBooking from "@/components/public/ManageBooking";
import { getBookingStatus } from "@/lib/booking.functions";
import { formatDateTime, formatMoney } from "@/lib/format";
import { whatsAppLink } from "@/lib/phone";

export const Route = createFileRoute("/pago/$codigo")({
  head: () => ({ meta: [{ title: "Estado de tu turno" }] }),
  component: PaymentStatusPage,
});

function PaymentStatusPage() {
  const { codigo } = Route.useParams();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["booking-status", codigo],
    queryFn: () => getBookingStatus({ data: { codigo } }),
    refetchInterval: (query) => (query.state.data?.estado === "pendiente_pago" ? 4000 : false),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-3xl">No pudimos consultar tu turno</h1>
          <p className="mt-3 text-sm text-muted-foreground">Revisá tu conexión. Tu reserva no se pierde por recargar esta página.</p>
          <Button className="mt-6 rounded-full" onClick={() => refetch()} disabled={isFetching}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-3xl">Turno no encontrado</h1>
          <p className="mt-3 text-sm text-muted-foreground">El link puede haber vencido o ser incorrecto.</p>
          <Button asChild variant="outline" className="mt-6 rounded-full">
            <Link to="/">Volver al inicio</Link>
          </Button>
        </div>
      </div>
    );
  }

  const confirmado = data.estado === "confirmado";
  const pendiente = data.estado === "pendiente_pago";
  const cancelado = data.estado === "cancelado" || data.estado === "expirado";
  const contactoLocal = whatsAppLink(
    data.comercio.telefono_whatsapp,
    `Hola ${data.comercio.nombre_comercio}! Soy ${data.cliente_nombre}, tengo un turno de ${data.servicio_nombre || "servicio"} el ${formatDateTime(
      data.fecha_hora_inicio,
    )}.`,
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-[0_40px_80px_-60px_rgba(20,15,10,0.6)]">
        <span
          className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${
            confirmado ? "bg-primary/10 text-primary" : cancelado ? "bg-destructive/10 text-destructive" : "bg-accent/10 text-accent"
          }`}
        >
          {confirmado ? <CalendarCheck className="h-6 w-6" /> : cancelado ? <CalendarX2 className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
        </span>

        <h1 className="mt-5 text-3xl leading-tight">
          {confirmado
            ? "¡Turno confirmado!"
            : pendiente
              ? "Esperando el pago"
              : data.estado === "cancelado"
                ? "Turno cancelado"
                : "Turno sin confirmar"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {confirmado
            ? `Te esperamos en ${data.comercio.nombre_comercio}. Guardá este link: desde acá podés cambiar o cancelar tu turno.`
            : pendiente
              ? "Estamos verificando el pago de la seña con Mercado Pago. Esta pantalla se actualiza sola."
              : data.estado === "cancelado"
                ? "Este turno está cancelado y el horario quedó libre. Podés reservar de nuevo cuando quieras."
                : "El pago no se completó y el horario se liberó. Podés reservar de nuevo cuando quieras."}
        </p>

        <div className="mt-6 space-y-3 rounded-2xl bg-secondary/70 px-4 py-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Servicio</span>
            <span className="text-right font-medium">{data.servicio_nombre}</span>
          </div>
          {data.staff_nombre ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Te atiende</span>
              <span className="text-right font-medium">{data.staff_nombre}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Fecha y hora</span>
            <span className="text-right font-medium">{formatDateTime(data.fecha_hora_inicio)}</span>
          </div>
          {data.monto_sena > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Seña</span>
              <span className="text-right font-medium">{formatMoney(data.monto_sena)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">A nombre de</span>
            <span className="text-right font-medium">{data.cliente_nombre}</span>
          </div>
        </div>

        {data.comercio.direccion ? (
          <p className="mt-4 inline-flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            {data.comercio.direccion}
          </p>
        ) : null}

        <ManageBooking booking={data} />

        <div className="mt-7 flex flex-col gap-2">
          {pendiente ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Verificando el pago…
            </div>
          ) : null}
          {!confirmado && !pendiente ? (
            <Button asChild className="rounded-full">
              <Link to="/$slug" params={{ slug: data.comercio.slug }}>
                Reservar otro turno
              </Link>
            </Button>
          ) : null}
          {contactoLocal ? (
            <Button asChild variant="outline" className="rounded-full">
              <a href={contactoLocal} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-1 h-4 w-4" />
                Escribir al local por WhatsApp
              </a>
            </Button>
          ) : null}
          <Button asChild variant="ghost" className="rounded-full">
            <Link to="/">Ir al inicio</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}