import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "./GoogleIcon";
import { signInWithGoogle } from "@/lib/auth-browser";
import { returnToSearch } from "@/lib/authReturnTo";

// Piezas que comparten las pantallas de autenticación.

export function AuthError({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
      {children}
    </div>
  );
}

export function SubmitButton({ busy, busyLabel, children, ...props }) {
  return (
    <Button type="submit" className="h-12 w-full font-medium" disabled={busy} {...props}>
      {busy ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

// Proveedores de login activos en el proyecto de Supabase (endpoint público con la clave anónima).
function useAuthProviders() {
  return useQuery({
    queryKey: ["auth-providers"],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      });
      if (!response.ok) return {};
      return (await response.json()).external || {};
    },
    staleTime: Infinity,
    retry: false,
  });
}

/** Botón de Google + separador "o". No se muestra si Google no está habilitado en Supabase. */
export function GoogleButton({ returnTo, onError }) {
  const { data: providers } = useAuthProviders();
  if (!providers?.google) return null;
  return (
    <>
      <Button
      type="button"
      variant="outline"
      className="mb-6 h-12 w-full text-sm font-medium"
      onClick={() => signInWithGoogle(returnTo).catch((err) => onError(err.message))}
    >
      <GoogleIcon className="mr-2 h-5 w-5" />
      Continuar con Google
      </Button>
      <OrDivider />
    </>
  );
}

export function OrDivider() {
  return (
    <div className="relative mb-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card px-3 text-muted-foreground">o</span>
      </div>
    </div>
  );
}

// Link entre pantallas de autenticación que arrastra el camino de vuelta (?returnTo=).
export function AuthLink({ to, returnTo, className = "font-medium text-primary hover:underline", children }) {
  return (
    <Link to={to} search={returnToSearch(returnTo)} className={className}>
      {children}
    </Link>
  );
}
