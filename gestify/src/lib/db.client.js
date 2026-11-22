// Errores de la base (Postgres / RLS) → mensajes para el usuario.
const DB_MESSAGES = {
  "23P01": "Ese horario se superpone con otro turno activo.",
  "42501": "No tenés permiso para hacer esto.",
  "23514": "Hay un valor fuera de rango. Revisá los datos.",
  "23505": "Ya existe un registro con esos datos.",
  PGRST116: "No encontramos el registro.",
};

/** Devuelve `data` de una respuesta de supabase-js o lanza un Error con mensaje legible. */
export function unwrapDb({ data, error }) {
  if (error) {
    console.error("[db]", error.code, error.message);
    throw Object.assign(new Error(DB_MESSAGES[error.code] || "No pudimos completar la operación. Probá de nuevo."), {
      code: error.code,
    });
  }
  return data;
}
