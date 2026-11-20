import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getCookies, setCookie } from "@tanstack/react-start/server";

function required(label, value) {
  if (!value) throw new Error(`Falta la variable de entorno ${label}`);
  return value;
}

const supabaseUrl = () =>
  required("SUPABASE_URL / VITE_SUPABASE_URL", process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || import.meta.env?.VITE_SUPABASE_URL);

const anonKey = () =>
  required("VITE_SUPABASE_ANON_KEY", process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY);

/**
 * Cliente "como el visitante": lee la sesión de las cookies de la request y respeta RLS.
 * Sirve para saber QUIÉN es el usuario (auth.getUser valida el token contra Supabase).
 */
export function getSupabaseServerClient() {
  return createServerClient(supabaseUrl(), anonKey(), {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value }));
      },
      setAll(list) {
        for (const { name, value, options } of list) {
          try {
            setCookie(name, value, options);
          } catch {
            // la respuesta ya empezó a enviarse: la próxima request renueva la sesión
          }
        }
      },
    },
  });
}

let admin;

/**
 * Cliente de SERVICIO: se saltea RLS. Solo para código de servidor que ya validó quién llama
 * y qué puede hacer (server functions, webhooks, cron). Nunca importar desde componentes.
 */
export function supabaseAdmin() {
  admin ??= createClient(supabaseUrl(), required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/** Error de base de datos: se registra en el servidor y al usuario le llega un mensaje genérico. */
export function dbFail(error, publicMessage = "No pudimos completar la operación. Probá de nuevo en unos minutos.") {
  console.error("[db]", error?.code, error?.message);
  return Object.assign(new Error(publicMessage), { cause: error });
}

/** Devuelve data de una respuesta de supabase-js o lanza el error genérico. */
export function unwrap(response, publicMessage) {
  if (response.error) throw dbFail(response.error, publicMessage);
  return response.data;
}
