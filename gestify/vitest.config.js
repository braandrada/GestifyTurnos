import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config propia para tests: sin los plugins de TanStack Start/Nitro (solo hace falta el alias "@").
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.js"],
    environment: "node",
  },
});
