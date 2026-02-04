import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

// Load .env file for API keys (falls back to process.env)
dotenv.config();

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
    setupFiles: ["tests/e2e/setup.ts"],
    testTimeout: 120000, // 2 minutes for real API calls
  },
  // No aliases - use real packages
});
