import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase-browser";

/**
 * Profesionales del comercio (id, nombre, activo) para selectores del panel.
 * Si la migración 005 no está corrida devuelve [] (el panel funciona como "local sin profesionales").
 */
export function useStaff(tenantId) {
  return useQuery({
    queryKey: ["staff-list", tenantId],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("staff")
        .select("id, nombre, activo")
        .eq("tenant_id", tenantId)
        .order("orden")
        .order("nombre");
      if (error) {
        console.warn("[staff]", error.code, error.message);
        return [];
      }
      return data;
    },
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });
}
