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
    // Names the run and sweeps up after it when DATABASE_URL is set; a
    // no-op without one.
    globalSetup: ["./vitest.globalSetup.ts"],
    // Gives each test file its own migrated, seeded schema when
    // DATABASE_URL is set. Per file rather than per run: two files that
    // disagree about global state must not depend on which worker runs
    // them. A no-op without one.
    setupFiles: ["./vitest.setup.ts"],
    // PGlite compiles Postgres to wasm on first use, and a cold Postgres
    // round trip is slower than a JSON file write.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
