import { createFileRoute } from "@tanstack/react-router";
import { AdminMfaPage } from "@/components/auth/AdminMfaPage";

export const Route = createFileRoute("/mfa")({ ssr: false, component: AdminMfaPage });
