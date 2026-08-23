/**
 * A disposable schema per test FILE, when DATABASE_URL is set.
 *
 * `vitest.globalSetup.ts` used to create one schema for the whole run and
 * every file shared it, which was fine right up until two files disagreed
 * about global state: `lib/pricebook/__tests__/api.test.ts` publishes a new
 * price book revision (that is the feature), and
 * `lib/db/__tests__/store.test.ts` asserts the org resolves to the seeded
 * book. Whether those two collided depended entirely on which worker
 * happened to run them and when — the suite passed for nine sessions on
 * scheduling luck, and adding unrelated test files to the run was enough to
 * lose it.
 *
 * So the isolation moves down a level: this runs once per test file, in the
 * worker, before the file is imported, and gives it a schema of its own —
 * migrated and seeded, identical to what a deployment gets from
 * `npm run db:setup`. Files can then mutate the org, publish revisions and
 * drop leads without any of it being visible to another file.
 *
 * The cost is one migrate-and-seed per file rather than per run. That is
 * the right trade: a test suite whose result depends on scheduling is not a
 * test suite, and the alternative — weakening an assertion until the two
 * files stop disagreeing — would delete the thing being asserted.
 *
 * With DATABASE_URL unset this does nothing at all: the store tests use
 * temp directories and the database acceptance test brings up an
 * in-process PGlite. `npm test` needs no server either way.
 */
import { randomBytes } from "node:crypto";

import { afterAll } from "vitest";

import { applyMigrations } from "./lib/db/migrate";
import { seedOrganization } from "./lib/db/seed";
import * as schema from "./lib/db/schema";

const url = process.env.DATABASE_URL;

if (url) {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");

  // The run's prefix comes from the global setup, so a crashed worker's
  // leftovers are still swept up when the run ends.
  const prefix = process.env.DB_SCHEMA_PREFIX ?? "test";
  const schemaName = `${prefix}_${randomBytes(4).toString("hex")}`;

  const admin = postgres(url, { max: 1 });
  await admin.unsafe(`create schema "${schemaName}"`);
  await admin.end();

  const client = postgres(url, { max: 1, connection: { search_path: schemaName } });
  const db = drizzle(client, { schema });
  await applyMigrations(db as never, { targetSchema: schemaName });
  await seedOrganization(db as never);
  await client.end();

  // Read lazily by lib/db/client.ts at connect time, which is inside a
  // test — so setting it here, before the test file is imported, is early
  // enough.
  process.env.DB_SCHEMA = schemaName;

  afterAll(async () => {
    const teardown = postgres(url, { max: 1 });
    await teardown.unsafe(`drop schema if exists "${schemaName}" cascade`);
    await teardown.end();
  });
}
