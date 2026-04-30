import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
