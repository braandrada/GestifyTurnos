import { getSupabase } from "@/lib/supabase-browser";

// Traduce los errores de Supabase Auth a mensajes para el usuario.
const MESSAGES = [
  [/rate limit|too many|security purposes/i, "Demasiados intentos. Esperá unos minutos y probá de nuevo."],
  [/invalid login credentials/i, "Email o contraseña incorrectos."],
  [/email not confirmed/i, "Todavía no confirmaste tu email. Registrate de nuevo para recibir un código."],
  [/already registered|already been registered/i, "Ese email ya tiene una cuenta. Ingresá o recuperá tu contraseña."],
  [/same password|different from the old/i, "Elegí una contraseña distinta a la anterior."],
  [/weak|pwned|easy to guess/i, "Esa contraseña es muy débil. Probá con una más larga y difícil."],
  [/at least \d+ characters|password should/i, "La contraseña es demasiado corta."],
  [/expired|invalid.*(token|otp|code)|otp/i, "El código es incorrecto o venció. Pedí uno nuevo."],
  [/session missing|not authenticated/i, "Tu sesión venció. Ingresá de nuevo."],
];

export function authMessage(error, fallback = "Ocurrió un error. Probá de nuevo.") {
  const text = String(error?.message || "");
  return MESSAGES.find(([pattern]) => pattern.test(text))?.[1] ?? fallback;
}

function fail(error, fallback) {
  throw new Error(authMessage(error, fallback));
}

const origin = () => window.location.origin;

export async function signInWithPassword(email, password) {
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) fail(error, "No pudimos iniciar sesión.");
}

/** Crea la cuenta. needsCode = hay que confirmar el email con el código; alreadyRegistered = el email ya existía. */
export async function signUp(email, password) {
  const { data, error } = await getSupabase().auth.signUp({
    email: email.trim(),
    password,
    // Si la plantilla de Supabase manda un link (la de fábrica) en vez del código, vuelve acá y entra al panel.
    options: { emailRedirectTo: `${origin()}/auth/confirm?type=signup&next=/panel` },
  });
  if (error) fail(error, "No pudimos crear la cuenta.");
  const alreadyRegistered = Array.isArray(data.user?.identities) && data.user.identities.length === 0;
  return { needsCode: !data.session && !alreadyRegistered, alreadyRegistered };
}

export async function verifySignupCode(email, code) {
  const { error } = await getSupabase().auth.verifyOtp({ email: email.trim(), token: code, type: "signup" });
  if (error) fail(error, "El código es incorrecto o venció.");
}

export async function resendSignupCode(email) {
  const { error } = await getSupabase().auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: `${origin()}/auth/confirm?type=signup&next=/panel` },
  });
  if (error) fail(error, "No pudimos reenviar el código.");
}

export async function requestPasswordReset(email) {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${origin()}/auth/confirm?type=recovery`,
  });
  if (error && /rate limit|too many/i.test(error.message || "")) fail(error);
  // Cualquier otro resultado se trata igual: no revelamos si el email existe.
}

export async function updatePassword(password) {
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) fail(error, "No pudimos cambiar la contraseña.");
}

export async function signInWithGoogle(returnTo = "/") {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin()}/auth/confirm?type=oauth&next=${encodeURIComponent(returnTo)}` },
  });
  if (error) fail(error, "No pudimos conectar con Google.");
}

export async function signOut() {
  await getSupabase().auth.signOut();
}
