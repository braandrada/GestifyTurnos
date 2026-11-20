import { fileURLToPath } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

// TanStack Start + Nitro: en Vercel Nitro aplica solo el preset "vercel" (sin configuración extra).
export default defineConfig(({ mode }) => {
  // En desarrollo, las variables del .env (también las SIN prefijo VITE_) quedan disponibles en process.env
  // para el código de servidor. En Vercel ya vienen en process.env y no se pisan.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 3000 },
  plugins: [tanstackStart({ srcDirectory: "src" }), nitro(), react()],
  };
});
