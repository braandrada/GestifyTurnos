import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthError, SubmitButton } from "@/components/auth/parts";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { authMessage, signOut } from "@/lib/auth-browser";
import { safeReturnTo } from "@/lib/authReturnTo";
import { getSupabase } from "@/lib/supabase-browser";

/**
 * Página /mfa: autenticación en dos pasos (TOTP) del super admin.
 *  - Primera vez: muestra el QR para vincular la app (Google Authenticator, Authy, 1Password…) y pide el primer código.
 *  - Después: pide el código de 6 dígitos de la app para completar el ingreso.
 * Los comercios no usan TOTP: si no es super admin, esta página los devuelve al panel.
 */
export function AdminMfaPage() {
  const returnTo = safeReturnTo();
  const destination = returnTo === "/" ? "/admin" : returnTo;
  const [phase, setPhase] = useState("loading"); // loading | enroll | verify
  const [factor, setFactor] = useState(null); // { id, qr, secret }
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const supabase = getSupabase();
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) {
          window.location.replace(`/login?returnTo=${encodeURIComponent("/mfa")}`);
          return;
        }

        const { data: profile } = await supabase.from("profiles").select("tipo_usuario").eq("id", userData.user.id).maybeSingle();
        if (profile?.tipo_usuario !== "super_admin") {
          window.location.replace("/panel");
          return;
        }

        const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (level?.currentLevel === "aal2") {
          window.location.replace(destination);
          return;
        }

        const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError) throw listError;

        const verified = factors.totp?.[0];
        if (verified) {
          setFactor({ id: verified.id });
          setPhase("verify");
          return;
        }

        // Quedó un intento anterior sin terminar: se descarta para poder generar un QR nuevo.
        for (const stale of (factors.all || []).filter((item) => item.status === "unverified")) {
          await supabase.auth.mfa.unenroll({ factorId: stale.id });
        }
        const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "Gestify Turnos (admin)",
        });
        if (enrollError) throw enrollError;
        setFactor({ id: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret });
        setPhase("enroll");
      } catch (err) {
        setError(authMessage(err, "No pudimos preparar la verificación en dos pasos."));
        setPhase("verify");
      }
    })();
  }, [destination]);

  async function submit(e) {
    e.preventDefault();
    if (!factor?.id) return;
    setError("");
    setBusy(true);
    try {
      const { error: verifyError } = await getSupabase().auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (verifyError) throw verifyError;
      window.location.href = destination; // recarga completa: la sesión ahora es aal2
    } catch (err) {
      setError(authMessage(err, "Código incorrecto. Probá con el que muestra tu app ahora."));
      setCode("");
      setBusy(false);
    }
  }

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Cargando" />
      </div>
    );
  }

  const enrolling = phase === "enroll";
  return (
    <AuthLayout
      icon={ShieldCheck}
      title={enrolling ? "Protegé tu cuenta" : "Verificación en dos pasos"}
      subtitle={enrolling ? "Vinculá una app de autenticación para entrar como administrador" : "Ingresá el código de tu app de autenticación"}
      footer={
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={async () => {
            await signOut();
            window.location.assign("/login");
          }}
        >
          Cerrar sesión
        </button>
      }
    >
      <form onSubmit={submit}>
        <AuthError>{error}</AuthError>
        {enrolling && factor?.qr && (
          <div className="mb-6 space-y-3 text-center">
            <p className="text-sm text-muted-foreground">1. Escaneá este código con tu app (Google Authenticator, Authy, 1Password…).</p>
            <img src={factor.qr} alt="Código QR para vincular tu app de autenticación" className="mx-auto h-44 w-44 rounded-lg border border-border bg-white p-2" />
            <p className="text-xs text-muted-foreground">
              ¿No podés escanear? Ingresá esta clave a mano:
              <br />
              <code className="select-all break-all font-mono text-foreground">{factor.secret}</code>
            </p>
            <p className="text-sm text-muted-foreground">2. Escribí el código de 6 dígitos que te muestra la app.</p>
          </div>
        )}
        <div className="mb-6 flex justify-center">
          <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus autoComplete="one-time-code">
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
        <SubmitButton busy={busy} busyLabel="Verificando…" disabled={busy || code.length < 6 || !factor?.id}>
          {enrolling ? "Activar y continuar" : "Verificar"}
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
