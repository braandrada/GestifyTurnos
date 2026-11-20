import { createFileRoute } from "@tanstack/react-router";
import MarketingNav from "@/components/marketing/MarketingNav";
import Hero from "@/components/marketing/Hero";
import { Features, HowItWorks, Rubros } from "@/components/marketing/Sections";
import MarketingFooter from "@/components/marketing/MarketingFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Turno · Agenda y señas online para tu local" },
      {
        name: "description",
        content:
          "Portal de reservas con seña por Mercado Pago y recordatorios por WhatsApp para barberías, tatuadores, peluquerías, centros de estética y consultorios.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main>
        <Hero />
        <Rubros />
        <HowItWorks />
        <Features />
      </main>
      <MarketingFooter />
    </div>
  );
}