import { defineConfig } from "drizzle-kit";

import { normalizeConnectionUrl } from "./lib/db/client";

/**
 * The migration CLI's view of the database.
 *
 * The URL goes through `normalizeConnectionUrl` for one reason, and it is
 * worth the import: a connection string copied out of Neon's console
 * carries `channel_binding=require`, which the driver forwards to the
 * server as a startup parameter and the server refuses. `drizzle-kit`
 * does not report that refusal — it prints "applying migrations..." and
 * spins forever. Stripping the parameter here is the difference between a
 * deploy and an afternoon.
 */
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: normalizeConnectionUrl(
      process.env.DATABASE_URL ?? "postgres://localhost:5432/landscapeai",
    ),
  },
});
