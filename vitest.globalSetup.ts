/**
 * Give the database-backed tests somewhere to run.
 *
 * With DATABASE_URL set, the whole suite runs against Postgres. Each test
 * FILE gets a disposable schema of its own — created, migrated and seeded
 * in `vitest.setup.ts`, which runs in the worker — so a run never touches a
 * developer's data, two runs never collide, and two files cannot disagree
 * about global state (see that file for the collision that made this
 * per-file rather than per-run).
 *
 * What is left here is the run's identity and its safety net: one prefix
 * every schema in this run is named after, and a teardown that drops
 * anything still carrying it, including the leftovers of a worker that
 * died before its own cleanup ran.
 *
 * With DATABASE_URL unset this does nothing: the store tests use their own
 * temp directories and the DB acceptance test brings up an in-process
 * PGlite. `npm test` needs no server either way.
 */
import { randomBytes } from "node:crypto";

export default async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  const { default: postgres } = await import("postgres");

  const prefix = `test_${randomBytes(4).toString("hex")}`;
  process.env.DB_SCHEMA_PREFIX = prefix;
  // A file that somehow reaches the database without going through the
  // per-file setup must not land in "public" — the developer's own data.
  process.env.DB_SCHEMA = `${prefix}_unclaimed`;
  console.log(`[vitest] Postgres tests running in disposable schemas ${prefix}_*`);

  return async () => {
    const teardown = postgres(url, { max: 1 });
    const leftovers = await teardown`
      select schema_name from information_schema.schemata
      where schema_name like ${`${prefix}%`}
    `;
    for (const row of leftovers) {
      await teardown.unsafe(`drop schema if exists "${row.schema_name}" cascade`);
    }
    await teardown.end();
  };
}
