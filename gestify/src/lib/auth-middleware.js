import { createMiddleware } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { getSupabaseServerClient, supabaseAdmin } from "@/lib/supabase.server";

function httpError(status, message, code) {
  setResponseStatus(status);
  return Object.assign(new Error(message), { status, code });
}

const adminMfaRequired = () => process.env.REQUIRE_ADMIN_MFA === "true";

// Quién es el visitante: la sesión viaja en cookies; auth.getUser() la valida contra Supabase.
async function loadCurrentUser() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile, error: profileError } = await supabaseAdmin()
    .from("profiles")
    .select("id, email, full_name, tenant_id, tipo_usuario")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  let aal = null;
  if (profile?.tipo_usuario === "super_admin" && adminMfaRequired()) {
    const result = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    aal = result.data?.currentLevel ?? null;
  }

  return {
    user: {
      id: data.user.id,
      email: (data.user.email || "").toLowerCase(),
      email_confirmed_at: data.user.email_confirmed_at || null,
      // Registro sin confirmación por email (signup.functions): el email no está comprobado.
      email_sin_verificar: data.user.app_metadata?.email_sin_verificar === true,
      full_name: profile?.full_name || data.user.user_metadata?.full_name || "",
    },
    profile: profile || null,
    aal,
  };
}

/**
 * Para server functions que necesitan sesión iniciada. Rechaza anónimos y deja en el contexto:
 *   context.user    -> { id, email, email_confirmed_at, full_name }
 *   context.profile -> fila de `profiles` (tenant_id, tipo_usuario)
 *   createServerFn().middleware([requireUser]).handler(({ context }) => ...)
 */
export const requireUser = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const current = await loadCurrentUser();
  if (!current) throw httpError(401, "Unauthorized", "UNAUTHORIZED");
  return next({ context: current });
});

/** Solo el super admin. Con REQUIRE_ADMIN_MFA=true además exige haber verificado TOTP (aal2). */
export const requireSuperAdmin = createMiddleware({ type: "function" })
  .middleware([requireUser])
  .server(async ({ next, context }) => {
    if (context.profile?.tipo_usuario !== "super_admin") {
      throw httpError(403, "Solo el administrador de la plataforma puede hacer esto", "FORBIDDEN");
    }
    if (adminMfaRequired() && context.aal !== "aal2") {
      throw httpError(403, "Verificá tu código de autenticación (TOTP) para continuar", "MFA_REQUIRED");
    }
    return next();
  });
