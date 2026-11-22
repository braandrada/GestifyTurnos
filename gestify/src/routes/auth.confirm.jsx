import { createFileRoute } from "@tanstack/react-router";
import { AuthConfirmPage } from "@/components/auth/AuthConfirmPage";

export const Route = createFileRoute("/auth/confirm")({ ssr: false, component: AuthConfirmPage });
