import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo } from "react";
import { signOut } from "@/lib/auth.client";
import { currentPath } from "@/lib/authReturnTo";
import { getSupabase } from "@/lib/supabase.client";

const isNoSession = (error) =>
  error?.name === "AuthSessionMissingError" || error?.status === 401 || error?.status === 403 || /session missing/i.test(error?.message ?? "");

/**
 * El visitante, resuelto una vez por carga de página y cacheado en el QueryClient del router.
 * Resuelve a `{ user, error }`: sin sesión es `{ user: null, error: null }`. Una caída de red u otro
 * error rechaza la promesa en vez de cachearse como "sin sesión".
 *
 * user = { id, email, full_name, tipo_usuario, tenant_id, role, aal, mfaVerified }
 *  - role "admin" = super admin (se mantiene el nombre que ya usan PanelShell y admin.jsx)
 *  - mfaVerified: solo para el super admin, true si ya validó su código TOTP en esta sesión
 */
export const authQuery = queryOptions({
  queryKey: ["auth", "me"],
  queryFn: async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (isNoSession(error)) return { user: null, error: null };
      throw error;
    }
    if (!data?.user) return { user: null, error: null };

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, tenant_id, tipo_usuario")
      .eq("id", data.user.id)
      .maybeSingle();

    const isAdmin = profile?.tipo_usuario === "super_admin";
    let aal = null;
    if (isAdmin) {
      const result = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      aal = result.data?.currentLevel ?? null;
    }

    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: profile?.full_name || data.user.user_metadata?.full_name || "",
        tipo_usuario: profile?.tipo_usuario || "comerciante",
        tenant_id: profile?.tenant_id || null,
        role: isAdmin ? "admin" : "user",
        aal,
        mfaVerified: isAdmin ? aal === "aal2" : null,
      },
      error: null,
    };
  },
  staleTime: Infinity,
  retry: false,
});

const AuthContext = createContext(null);

/**
 * Estado de sesión en el navegador. El servidor renderiza todo como anónimo y la consulta corre
 * recién tras la hidratación, así el primer render coincide con el HTML del servidor.
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const { data, error, isPending } = useQuery(authQuery);

  // Si la sesión se cierra en otra pestaña, esta también se entera.
  useEffect(() => {
    const { data: subscription } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") queryClient.setQueryData(authQuery.queryKey, { user: null, error: null });
    });
    return () => subscription.subscription.unsubscribe();
  }, [queryClient]);

  const value = useMemo(
    () => ({
      user: data?.user ?? null,
      isAuthenticated: !!data?.user,
      isLoadingAuth: isPending,
      authError: data?.error ?? (error ? { type: "unknown", message: error.message ?? "No pudimos cargar tu sesión" } : null),
      refresh: () => queryClient.fetchQuery({ ...authQuery, staleTime: 0 }),
      logout: async () => {
        queryClient.setQueryData(authQuery.queryKey, { user: null, error: null });
        await signOut();
        window.location.assign("/");
      },
      navigateToLogin: () => {
        window.location.assign(`/login?returnTo=${encodeURIComponent(currentPath())}`);
      },
    }),
    [data, error, isPending, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
