import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { SpecCoverageReporter } from "./spec-coverage/reporter.ts";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}", "spec-coverage/**/*.test.ts"],
    // SPEC §7.9 (Q-16): the default reporter plus the FE-ID coverage check.
    reporters: ["default", new SpecCoverageReporter()],
  },
});
