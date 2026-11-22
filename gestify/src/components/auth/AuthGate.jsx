import { redirect } from "@tanstack/react-router";
import { DefaultCatchBoundary } from "@/components/DefaultCatchBoundary";
import { authQuery } from "@/lib/AuthContext";

/**
 * Puerta de login para la ruta de layout sin path (src/routes/_authed.jsx): protege todo lo que
 * está en src/routes/_authed/ (sus URLs no llevan "_authed").
 *
 *   createFileRoute("/_authed")({ ssr: false, beforeLoad: requireSignedIn, errorComponent: DefaultCatchBoundary })
 *
 *  - Sin sesión → /login con el camino de vuelta.
 *  - Super admin sin código TOTP verificado → /mfa (la autenticación en dos pasos es obligatoria para él).
 * Los hijos leen al visitante con `Route.useRouteContext().user`.
 * Una caída de red no equivale a "sin sesión": rechaza y llega al error boundary, cuyo "Reintentar" vuelve a consultar.
 */
export async function requireSignedIn({ context, location }) {
  const { user } = await context.queryClient.ensureQueryData(authQuery);
  if (!user) {
    throw redirect({ to: "/login", search: { returnTo: location.href }, reloadDocument: true });
  }
  if (user.role === "admin" && !user.mfaVerified) {
    throw redirect({ to: "/mfa", search: { returnTo: location.href }, reloadDocument: true });
  }
  return { user };
}

export const AuthGateError = DefaultCatchBoundary;
