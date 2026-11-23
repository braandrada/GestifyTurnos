import { Lock, LogIn, Mail } from "lucide-react";
import { useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthError, AuthLink, GoogleButton, SubmitButton } from "@/components/auth/parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithPassword } from "@/lib/auth-browser";
import { safeReturnTo } from "@/lib/authReturnTo";

// Página /login. ?returnTo= es adonde va la persona después de ingresar (sin destino, al panel).
export function LoginPage() {
  const returnTo = safeReturnTo();
  const destination = returnTo === "/" ? "/panel" : returnTo;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signInWithPassword(email, password);
      // Redirección completa: la app se reinicia con la sesión nueva.
      window.location.href = destination;
    } catch (err) {
      setError(err.message || "Email o contraseña incorrectos.");
      setBusy(false);
    }
  }

  return (
    <AuthLayout icon={LogIn} title="Bienvenido de nuevo" subtitle="Ingresá con tu cuenta para administrar tu local">
      <GoogleButton returnTo={destination} onError={setError} />
      <AuthError>{error}</AuthError>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="login-email" type="email" autoComplete="email" autoFocus placeholder="vos@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 pl-10" required />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Contraseña</Label>
            <AuthLink to="/forgot-password" returnTo={returnTo} className="text-xs text-primary hover:underline">
              ¿Olvidaste tu contraseña?
            </AuthLink>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="login-password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pl-10" required />
          </div>
        </div>
        <SubmitButton busy={busy} busyLabel="Ingresando…">
          Ingresar
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿No tenés cuenta?{" "}
        <AuthLink to="/register" returnTo={returnTo}>
          Creala acá
        </AuthLink>
      </p>
    </AuthLayout>
  );
}
