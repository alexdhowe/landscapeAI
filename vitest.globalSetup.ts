/**
 * Give the database-backed tests somewhere to run.
 *
 * With DATABASE_URL set, the whole suite runs against Postgres. It gets a
 * disposable schema per run — created here, migrated, seeded with the one
 * org, and dropped on teardown — so a test run never touches a developer's
 * data and two runs never collide.
 *
 * With DATABASE_URL unset this does nothing: the store tests use their own
 * temp directories and the DB acceptance test brings up an in-process
 * PGlite. `npm test` needs no server either way.
 */
import { randomBytes } from "node:crypto";

import { applyMigrations } from "./lib/db/migrate";
import { seedOrganization } from "./lib/db/seed";
import * as schema from "./lib/db/schema";

export default async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");

  const schemaName = `test_${randomBytes(5).toString("hex")}`;
  const admin = postgres(url, { max: 1 });
  await admin.unsafe(`create schema "${schemaName}"`);
  await admin.end();

  const client = postgres(url, { max: 1, connection: { search_path: schemaName } });
  const db = drizzle(client, { schema });
  await applyMigrations(db as never, { targetSchema: schemaName });
  await seedOrganization(db as never);
  await client.end();

  process.env.DB_SCHEMA = schemaName;
  console.log(`[vitest] Postgres tests running in disposable schema ${schemaName}`);

  return async () => {
    const teardown = postgres(url, { max: 1 });
    await teardown.unsafe(`drop schema "${schemaName}" cascade`);
    await teardown.end();
  };
}
