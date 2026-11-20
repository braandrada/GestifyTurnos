import { TZ } from "@/lib/slots";

export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateLong(dateKey) {
  return new Date(`${dateKey}T12:00:00-03:00`).toLocaleDateString("es-AR", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}