import { Lock, Mail, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthError, AuthLink, GoogleButton, OrDivider, SubmitButton } from "@/components/auth/parts";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { resendSignupCode, signUp, verifySignupCode } from "@/lib/auth-browser";
import { safeReturnTo } from "@/lib/authReturnTo";

const MIN_PASSWORD = 8;

/**
 * Página /register: formulario → código de 6 dígitos que llega por email → sesión iniciada.
 * (Requiere en Supabase: "Confirm email" activado y la plantilla "Confirm signup" con {{ .Token }}.)
 */
export function RegisterPage() {
  const returnTo = safeReturnTo();
  const destination = returnTo === "/" ? "/panel" : returnTo;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState("form");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function register(e) {
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
      const result = await signUp(email, password);
      if (result.alreadyRegistered) setStep("already_registered");
      else if (result.needsCode) setStep("otp");
      else window.location.href = destination; // el proyecto no exige confirmar el email
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await verifySignupCode(email, otpCode);
      window.location.href = destination;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function resend() {
    setError("");
    try {
      await resendSignupCode(email);
      toast("Código enviado", { description: "Revisá tu email: te mandamos un código nuevo." });
    } catch (err) {
      setError(err.message);
    }
  }

  if (step === "already_registered") {
    return (
      <AuthLayout icon={UserPlus} title="Creá tu cuenta" subtitle="Empezá a recibir turnos online">
        <p className="mb-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{email}</span> ya tiene una cuenta. Ingresá, o recuperá tu contraseña si no la recordás.
        </p>
        <AuthLink to="/login" returnTo={returnTo} className="inline-flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Ingresar
        </AuthLink>
        <p className="mt-4 text-center text-sm">
          <AuthLink to="/forgot-password" returnTo={returnTo}>
            Recuperar contraseña
          </AuthLink>
        </p>
      </AuthLayout>
    );
  }

  if (step === "otp") {
    return (
      <AuthLayout icon={UserPlus} title="Confirmá tu email" subtitle="Es el último paso">
        <form onSubmit={verify}>
          <p className="mb-4 text-sm text-muted-foreground">
            Te enviamos un código de 6 dígitos a <span className="font-medium text-foreground">{email}</span>.
          </p>
          <AuthError>{error}</AuthError>
          <div className="mb-6 flex justify-center">
            <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus autoComplete="one-time-code">
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <SubmitButton busy={busy} busyLabel="Verificando…" disabled={busy || otpCode.length < 6}>
            Verificar
          </SubmitButton>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            ¿No te llegó el código?{" "}
            <button type="button" onClick={resend} className="font-medium text-primary hover:underline">
              Reenviar
            </button>
          </p>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={UserPlus} title="Creá tu cuenta" subtitle="Empezá a recibir turnos online">
      <GoogleButton returnTo={destination} onError={setError} />
      <OrDivider />
      <AuthError>{error}</AuthError>
      <form onSubmit={register} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="register-email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="register-email" type="email" autoComplete="email" autoFocus placeholder="vos@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 pl-10" disabled={busy} required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="register-password">Contraseña</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="register-password" type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pl-10" disabled={busy} required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="register-confirm">Repetí la contraseña</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="register-confirm" type="password" autoComplete="new-password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-12 pl-10" disabled={busy} required />
          </div>
        </div>
        <SubmitButton busy={busy} busyLabel="Creando cuenta…">
          Crear cuenta
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Ya tenés cuenta?{" "}
        <AuthLink to="/login" returnTo={returnTo}>
          Ingresá
        </AuthLink>
      </p>
    </AuthLayout>
  );
}
