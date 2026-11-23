import { Link } from "@tanstack/react-router";
import { AlertTriangle, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthError, SubmitButton } from "@/components/auth/parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword } from "@/lib/auth-browser";
import { getSupabase } from "@/lib/supabase-browser";

const MIN_PASSWORD = 8;

// Página /reset-password: la persona llega ya con sesión (por /auth/confirm) desde el mail de
// recuperación o de invitación, y elige su contraseña.
export function ResetPasswordPage() {
  const isInvite = new URLSearchParams(window.location.search).get("modo") === "invite";
  const [hasSession, setHasSession] = useState(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSupabase()
      .auth.getSession()
      .then(({ data }) => setHasSession(Boolean(data.session)));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      window.location.href = "/panel";
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (hasSession === null) return null;

  if (!hasSession) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Link inválido o vencido"
        subtitle="No pudimos verificar tu link"
        footer={
          <Link to="/forgot-password" className="font-medium text-primary hover:underline">
            Pedir un link nuevo
          </Link>
        }
      >
        <p className="text-center text-sm text-foreground">Los links de recuperación se pueden usar una sola vez y vencen. Pedí uno nuevo.</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title={isInvite ? "Elegí tu contraseña" : "Nueva contraseña"}
      subtitle={isInvite ? "Con ella vas a ingresar a tu panel de Gestify Turnos" : "Ingresá tu nueva contraseña"}
    >
      <AuthError>{error}</AuthError>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="reset-password">Contraseña</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="reset-password" type="password" autoComplete="new-password" autoFocus placeholder="Mínimo 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pl-10" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reset-confirm">Repetí la contraseña</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="reset-confirm" type="password" autoComplete="new-password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-12 pl-10" required />
          </div>
        </div>
        <SubmitButton busy={busy} busyLabel="Guardando…">
          Guardar contraseña
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
