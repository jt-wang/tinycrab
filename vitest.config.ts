import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Exclude e2e tests from default run - they need real API keys
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/integration-http/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/__mocks__/**"],
    },
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@mariozechner/pi-coding-agent": resolve(__dirname, "src/__mocks__/pi-coding-agent.ts"),
      "@mariozechner/pi-ai": resolve(__dirname, "src/__mocks__/pi-ai.ts"),
    },
  },
});
