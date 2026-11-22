import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, CreditCard, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useMerchant } from "@/hooks/useMerchant";
import { saveIntegration, saveTenantSettings } from "@/lib/merchant.functions";

export const Route = createFileRoute("/_authed/panel/integraciones")({ component: IntegrationsPage });

function IntegrationsPage() {
  const { data: merchant } = useMerchant();
  const queryClient = useQueryClient();
  const tenant = merchant?.tenant;
  const integration = merchant?.integration;

  const [business, setBusiness] = useState({});
  const [mpToken, setMpToken] = useState("");
  const [messaging, setMessaging] = useState({ whatsapp_api_url: "", whatsapp_token: "", whatsapp_activo: true });
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (tenant) {
      setBusiness({
        nombre_comercio: tenant.nombre_comercio || "",
        rubro: tenant.rubro || "",
        direccion: tenant.direccion || "",
        telefono_whatsapp: tenant.telefono_whatsapp || "",
        politica_sena: tenant.politica_sena || "",
        horas_aviso_previo: tenant.horas_aviso_previo ?? 24,
      });
    }
  }, [tenant]);

  useEffect(() => {
    if (integration) {
      // Los tokens ya guardados no vuelven al navegador: el campo queda vacío y vacío significa "no cambiar".
      setMessaging({
        whatsapp_api_url: integration.whatsapp_api_url || "",
        whatsapp_token: "",
        whatsapp_activo: integration.whatsapp_activo !== false,
      });
    }
  }, [integration]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["merchant-access"] });

  async function run(action, label) {
    setBusy(true);
    setSaved("");
    setError("");
    try {
      await action();
      await refresh();
      setSaved(label);
    } catch (err) {
      setError(err.message || "No pudimos guardar los cambios.");
    } finally {
      setBusy(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/${tenant.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!tenant) return null;

  return (
    <div className="space-y-6">
      <div>
        <p className="label-micro">Configuración</p>
        <h1 className="mt-1 text-3xl">Integraciones y datos</h1>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="label-micro">Portal público</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-secondary px-3 py-2 text-sm">/{tenant.slug}</code>
          <Button variant="outline" size="sm" className="rounded-full" onClick={copyLink}>
            {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
            {copied ? "Copiado" : "Copiar link"}
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg">Datos del comercio</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={business.nombre_comercio || ""} onChange={(e) => setBusiness({ ...business, nombre_comercio: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Rubro</Label>
            <Input value={business.rubro || ""} onChange={(e) => setBusiness({ ...business, rubro: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Dirección</Label>
            <Input value={business.direccion || ""} onChange={(e) => setBusiness({ ...business, direccion: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp del local</Label>
            <Input value={business.telefono_whatsapp || ""} onChange={(e) => setBusiness({ ...business, telefono_whatsapp: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Aviso previo de recordatorio (horas)</Label>
            <Input
              type="number"
              min="1"
              value={business.horas_aviso_previo ?? 24}
              onChange={(e) => setBusiness({ ...business, horas_aviso_previo: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Label>Política de seña</Label>
          <Textarea
            rows={3}
            value={business.politica_sena || ""}
            onChange={(e) => setBusiness({ ...business, politica_sena: e.target.value })}
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button
            className="rounded-full"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  saveTenantSettings({
                    data: { ...business, horas_aviso_previo: Number(business.horas_aviso_previo) || 24 },
                  }),
                "Datos guardados",
              )
            }
          >
            Guardar datos
          </Button>
          {saved === "Datos guardados" ? <span className="text-xs text-primary">{saved}</span> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg">Mercado Pago</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Con el access token de tu cuenta cobramos las señas de tus turnos. Sin token, las reservas se confirman sin
          seña online.
        </p>
        <p className="mt-3 text-sm">
          Estado:{" "}
          {integration?.mp_conectado ? (
            <span className="font-medium text-primary">conectado</span>
          ) : (
            <span className="text-muted-foreground">sin conectar</span>
          )}
        </p>
        <div className="mt-4 space-y-2">
          <Label>{integration?.mp_conectado ? "Reemplazar access token" : "Access token de producción"}</Label>
          <Input
            type="password"
            autoComplete="off"
            placeholder="APP_USR-…"
            value={mpToken}
            onChange={(e) => setMpToken(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Por seguridad, el token guardado no se vuelve a mostrar.</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            className="rounded-full"
            disabled={busy || !mpToken.trim()}
            onClick={() =>
              run(async () => {
                await saveIntegration({ data: { mp_access_token: mpToken.trim() } });
                setMpToken("");
              }, "Mercado Pago actualizado")
            }
          >
            Guardar token
          </Button>
          {integration?.mp_conectado ? (
            <Button
              variant="outline"
              className="rounded-full"
              disabled={busy}
              onClick={() => run(() => saveIntegration({ data: { quitar_mp_token: true } }), "Mercado Pago desconectado")}
            >
              Desconectar
            </Button>
          ) : null}
          {saved.startsWith("Mercado Pago") ? <span className="text-xs text-primary">{saved}</span> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg">Recordatorios por WhatsApp</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Pegá el endpoint de envío de tu proveedor (Evolution API, Meta Cloud API a través de un adaptador o Twilio).
          Recibe <code className="rounded bg-secondary px-1">{"{ number, text }"}</code>.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>URL del webhook de envío</Label>
            <Input
              placeholder="https://tu-proveedor/message/sendText/local"
              value={messaging.whatsapp_api_url}
              onChange={(e) => setMessaging({ ...messaging, whatsapp_api_url: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Token / API key</Label>
            <Input
              type="password"
              autoComplete="off"
              placeholder={integration?.whatsapp_token_configurado ? "Guardado (dejá vacío para no cambiarlo)" : ""}
              value={messaging.whatsapp_token}
              onChange={(e) => setMessaging({ ...messaging, whatsapp_token: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Enviar recordatorios</p>
            <p className="text-xs text-muted-foreground">Confirmación, aviso previo y recordatorio 2 horas antes.</p>
          </div>
          <Switch
            checked={messaging.whatsapp_activo}
            onCheckedChange={(checked) => setMessaging({ ...messaging, whatsapp_activo: checked })}
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button
            className="rounded-full"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  saveIntegration({
                    data: {
                      whatsapp_api_url: messaging.whatsapp_api_url.trim(),
                      whatsapp_activo: messaging.whatsapp_activo,
                      ...(messaging.whatsapp_token.trim() ? { whatsapp_token: messaging.whatsapp_token.trim() } : {}),
                    },
                  }),
                "Mensajería actualizada",
              )
            }
          >
            Guardar mensajería
          </Button>
          {integration?.whatsapp_token_configurado ? (
            <Button
              variant="outline"
              className="rounded-full"
              disabled={busy}
              onClick={() => run(() => saveIntegration({ data: { quitar_whatsapp_token: true } }), "Mensajería actualizada")}
            >
              Quitar token
            </Button>
          ) : null}
          {saved === "Mensajería actualizada" ? <span className="text-xs text-primary">{saved}</span> : null}
        </div>
      </section>
    </div>
  );
}