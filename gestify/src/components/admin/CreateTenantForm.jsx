import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/AuthContext";
import { slugify } from "@/lib/format";
import { createOwnTenant } from "@/lib/merchant.functions";
import { checkSlug } from "@/lib/slugs";

const RUBROS = ["Barbería", "Peluquería", "Estética", "Uñas", "Tatuajes", "Masajes", "Consultorio", "Otro"];

/** Primer ingreso de un usuario sin comercio: crea el suyo y entra al panel. */
export default function CreateTenantForm() {
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const [form, setForm] = useState({ nombre_comercio: "", rubro: "", slug: "", telefono_whatsapp: "", direccion: "" });
  const [slugEditado, setSlugEditado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const slug = slugEditado ? form.slug : slugify(form.nombre_comercio);
  const origin = typeof window !== "undefined" ? window.location.host : "";

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setError("");
    const { error: slugError } = checkSlug(slug);
    if (slugError) return setError(slugError);
    setBusy(true);
    try {
      await createOwnTenant({ data: { ...form, slug } });
      await queryClient.invalidateQueries({ queryKey: ["merchant-access"] });
    } catch (err) {
      setError(err?.message || "No pudimos crear tu comercio. Probá de nuevo.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 sm:p-8">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Store className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-3xl leading-tight">Creá tu comercio</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Con estos datos armamos tu página de reservas. Empezás con un período de prueba y podés cambiar todo después.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ct-nombre">Nombre del local</Label>
            <Input id="ct-nombre" required minLength={2} maxLength={120} value={form.nombre_comercio} onChange={set("nombre_comercio")} placeholder="Nombre de tu comercio" autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-rubro">Rubro</Label>
            <select
              id="ct-rubro"
              required
              value={form.rubro}
              onChange={set("rubro")}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Elegí uno</option>
              {RUBROS.map((rubro) => (
                <option key={rubro} value={rubro}>
                  {rubro}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-slug">Dirección de tu página</Label>
            <div className="flex items-center rounded-md border border-input bg-background pl-3 text-sm focus-within:ring-2 focus-within:ring-ring">
              <span className="shrink-0 text-muted-foreground">{origin}/</span>
              <input
                id="ct-slug"
                value={slug}
                maxLength={40}
                onChange={(event) => {
                  setSlugEditado(true);
                  setForm((current) => ({ ...current, slug: event.target.value.toLowerCase() }));
                }}
                onBlur={() => setForm((current) => ({ ...current, slug: slugify(slug) }))}
                className="h-10 min-w-0 flex-1 bg-transparent pr-3 outline-none"
                placeholder="nombre-de-tu-comercio"
              />
            </div>
            <p className="text-xs text-muted-foreground">Es el link que vas a compartir con tus clientes. Solo letras, números y guiones.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ct-whatsapp">WhatsApp del local (opcional)</Label>
              <Input id="ct-whatsapp" type="tel" inputMode="tel" value={form.telefono_whatsapp} onChange={set("telefono_whatsapp")} placeholder="11 5555 5555" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ct-direccion">Dirección (opcional)</Label>
              <Input id="ct-direccion" maxLength={200} value={form.direccion} onChange={set("direccion")} placeholder="Tu dirección completa" />
            </div>
          </div>

          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="h-12 w-full rounded-full" disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Crear mi comercio
          </Button>
        </form>

        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          Ingresaste como {user?.email}.
          <button type="button" onClick={logout} className="inline-flex items-center gap-1 underline">
            <LogOut className="h-3 w-3" />
            Salir
          </button>
        </p>
      </div>
    </div>
  );
}
