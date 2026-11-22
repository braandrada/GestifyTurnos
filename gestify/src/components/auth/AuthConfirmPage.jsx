import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthLink } from "@/components/auth/parts";
import { authMessage } from "@/lib/auth.client";
import { sanitizeReturnTo } from "@/lib/authReturnTo";
import { getSupabase } from "@/lib/supabase.client";

// Tipos de link de email que aceptamos. Cada uno llega con ?token_hash=...
const EMAIL_LINK_TYPES = new Set(["recovery", "invite"]);

/**
 * Página /auth/confirm: destino de todo lo que vuelve de Supabase por link.
 *  - Invitación de un comercio y recuperación de contraseña: ?type=invite|recovery&token_hash=... → inicia sesión
 *    y lleva a /reset-password para elegir la contraseña.
 *  - Google: ?code=... (el cliente de Supabase lo canjea) → lleva a ?next=.
 */
export function AuthConfirmPage() {
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const type = params.get("type");
      const tokenHash = params.get("token_hash");
      const code = params.get("code");
      const providerError = params.get("error_description");
      const supabase = getSupabase();

      try {
        if (providerError) throw new Error(providerError);

        if (tokenHash) {
          if (!EMAIL_LINK_TYPES.has(type)) throw new Error("Link inválido");
          const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (verifyError) throw verifyError;
          window.location.replace(`/reset-password?modo=${type}`);
          return;
        }

        if (code) {
          // El cliente de Supabase puede haber canjeado el código solo al iniciar: si ya hay sesión, no se repite.
          let { data } = await supabase.auth.getSession();
          if (!data.session) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
          }
          const next = sanitizeReturnTo(params.get("next"));
          window.location.replace(next === "/" ? "/panel" : next);
          return;
        }

        throw new Error("Link incompleto");
      } catch (err) {
        setError(authMessage(err, "El link es inválido o venció."));
      }
    })();
  }, []);

  if (!error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Verificando" />
      </div>
    );
  }

  return (
    <AuthLayout icon={AlertTriangle} title="No pudimos verificar el link" subtitle={error}>
      <p className="text-center text-sm text-muted-foreground">
        Los links se pueden usar una sola vez y vencen.{" "}
        <AuthLink to="/forgot-password">Pedí uno nuevo</AuthLink> o <AuthLink to="/login">volvé a ingresar</AuthLink>.
      </p>
    </AuthLayout>
  );
}
