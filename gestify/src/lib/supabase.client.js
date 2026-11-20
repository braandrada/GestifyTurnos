import { createBrowserClient } from "@supabase/ssr";

let client;

/**
 * Cliente de Supabase para el NAVEGADOR (clave pública + sesión del usuario, con RLS).
 * La sesión se guarda en cookies, así las server functions la reciben solas.
 */
export function getSupabase() {
  client ??= createBrowserClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
  return client;
}
