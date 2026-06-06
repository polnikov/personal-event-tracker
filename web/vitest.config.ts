import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Standalone Vitest config (does not load vite.config.ts, so the PWA plugin
// and dev-proxy stay out of the test run). Only the "@" alias is mirrored.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "text"],
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      // Test files, type-only modules, the app entrypoint, the design-system
      // barrel and generated/vendor glue aren't meaningful coverage targets.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/types/**",
        "src/vite-env.d.ts",
      ],
      // Floors set just below current numbers. Overall lines are low because
      // most pages/components are still untested — these gate against losing
      // existing tests; raise them as page/component coverage grows.
      thresholds: {
        statements: 12,
        lines: 12,
        functions: 35,
        branches: 70,
      },
    },
  },
});
