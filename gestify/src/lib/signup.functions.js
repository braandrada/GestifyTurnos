import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase.server";

/**
 * Registro sin confirmación por email: la cuenta se crea desde el servidor ya confirmada y el navegador
 * inicia sesión enseguida con email y contraseña. Funciona igual tenga o no Supabase activado "Confirm email".
 *
 * Como nadie comprobó que el email sea de quien se registra, la cuenta queda marcada en app_metadata
 * (no editable por el usuario) con `email_sin_verificar`. Con esa marca NO se vincula automáticamente a un
 * comercio dado de alta por el super admin con ese email (ver ensureMerchantAccess): evita que alguien se
 * registre con el email de otro y se quede con su comercio. Sí puede crear su propio comercio.
 */
export const registerAccount = createServerFn({ method: "POST" })
  .validator(
    z.object({
      email: z.string().trim().toLowerCase().email("Ingresá un email válido").max(200),
      password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(72),
    }),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin().auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      app_metadata: { email_sin_verificar: true },
    });
    if (error) {
      if (/already|exists|registered/i.test(error.message || "") || error.status === 422) {
        return { ok: false, alreadyRegistered: true };
      }
      if (/password/i.test(error.message || "")) {
        throw new Error("Esa contraseña es muy débil. Probá con una más larga y difícil.");
      }
      console.error("[signup]", error.status, error.message);
      throw new Error("No pudimos crear la cuenta. Probá de nuevo en unos minutos.");
    }
    return { ok: true, alreadyRegistered: false };
  });
