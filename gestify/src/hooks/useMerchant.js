import { useQuery } from "@tanstack/react-query";
import { ensureMerchantAccess } from "@/lib/merchant.functions";

export function useMerchant() {
  return useQuery({
    queryKey: ["merchant-access"],
    queryFn: () => ensureMerchantAccess(),
    staleTime: 60_000,
  });
}