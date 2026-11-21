import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.{ts,tsx,mjs}"] },
  resolve: {
    alias: {
      "@gxe/react": fileURLToPath(new URL("./lib/gxe/react.tsx", import.meta.url)),
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
