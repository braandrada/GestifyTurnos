import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthError, AuthLink, SubmitButton } from "@/components/auth/parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/auth.client";
import { safeReturnTo } from "@/lib/authReturnTo";

// Página /forgot-password. Siempre termina con el mismo mensaje: no revelamos si el email tiene cuenta.
export function ForgotPasswordPage() {
  const returnTo = safeReturnTo();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err.message); // solo "demasiados intentos"
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout icon={Mail} title="Recuperar contraseña" subtitle="Te mandamos un link para elegir una nueva">
      {sent ? (
        <p className="text-center text-sm text-foreground">Si existe una cuenta con ese email, en unos minutos vas a recibir un link para restablecer tu contraseña.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <AuthError>{error}</AuthError>
          <div className="space-y-2">
            <Label htmlFor="forgot-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="forgot-email" type="email" autoComplete="email" autoFocus placeholder="vos@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 pl-10" required />
            </div>
          </div>
          <SubmitButton busy={busy} busyLabel="Enviando…">
            Enviar link
          </SubmitButton>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <AuthLink to="/login" returnTo={returnTo}>
          <ArrowLeft className="mr-1 inline h-3 w-3" aria-hidden="true" />
          Volver a ingresar
        </AuthLink>
      </p>
    </AuthLayout>
  );
}
