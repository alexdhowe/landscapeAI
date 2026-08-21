import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["lib/**/__tests__/**/*.test.ts"],
    environment: "node",
    // Creates and drops a disposable Postgres schema when DATABASE_URL is
    // set; a no-op without one.
    globalSetup: ["./vitest.globalSetup.ts"],
    // PGlite compiles Postgres to wasm on first use, and a cold Postgres
    // round trip is slower than a JSON file write.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
