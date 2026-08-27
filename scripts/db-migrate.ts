/**
 * Apply the generated migrations, without the drizzle-kit CLI.
 *
 *   npm run db:migrate          # drizzle-kit, the normal path
 *   npm run db:migrate:direct   # this, when that one will not finish
 *
 * Why this exists. `npm run db:migrate` shells out to `drizzle-kit`, which
 * resolves a config file, builds its own connection from
 * `drizzle.config.ts`, and prints a spinner. When it works it is the right
 * thing to run and this script is redundant. When it does not, the spinner
 * is the only thing you get: an eleventh-session run against a local
 * server sat on "applying migrations..." indefinitely and the schema had
 * to be created by piping the .sql files through psql by hand — which
 * leaves drizzle's journal empty, so the *next* migration replays all of
 * them onto a database that already has the tables.
 *
 * This is the same migration, journaled the same way, with the two things
 * that turn a hang into a message:
 *
 *   - a connect timeout, so an unreachable or asleep server fails in
 *     seconds and says so. Neon's free tier suspends after five minutes
 *     idle, so the first connection of the day is a cold one.
 *   - the connection is closed and the process exits, rather than being
 *     held open by an idle pool.
 *
 * It runs drizzle-orm's own migrator, not a reimplementation of it, so the
 * `drizzle.__drizzle_migrations` rows it writes are the rows drizzle-kit
 * would have written — you can run either one next and it will pick up
 * where this left off. Verified both directions against Postgres 16.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { loadEnvLocal } from "../lib/env/localFile";
import { isPooledConnection, normalizeConnectionUrl } from "../lib/db/client";
import { MIGRATIONS_DIR } from "../lib/db/migrate";

loadEnvLocal();

/** Seconds to wait for a connection before giving up on it. */
const CONNECT_TIMEOUT_SECONDS = Number(process.env.DB_CONNECT_TIMEOUT ?? 30);

type Journal = { entries: { idx: number; tag: string }[] };

/** How many migrations the journal table says are already in. */
async function applied(sql: ReturnType<typeof import("postgres")>): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    select count(*)::text as count
    from information_schema.tables
    where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
  `;
  if (rows[0]?.count === "0") return 0;
  const counted = await sql<{ count: string }[]>`
    select count(*)::text as count from drizzle.__drizzle_migrations
  `;
  return Number(counted[0]?.count ?? 0);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "No DATABASE_URL set.\n" +
        "  Local: postgres://user:password@127.0.0.1:5432/landscapeai\n" +
        "  Neon:  the direct (not -pooler) string from the project's Connect panel.",
    );
    process.exit(1);
  }

  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
  ) as Journal;
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "the configured server";
    }
  })();
  console.log(
    `${journal.entries.length} migrations on disk, through ${journal.entries.at(-1)?.tag}.\n` +
      `Connecting to ${host} (${CONNECT_TIMEOUT_SECONDS}s timeout)…`,
  );

  const [{ default: postgres }, { drizzle }, { migrate }] = await Promise.all([
    import("postgres"),
    import("drizzle-orm/postgres-js"),
    import("drizzle-orm/postgres-js/migrator"),
  ]);

  const sql = postgres(normalizeConnectionUrl(url), {
    max: 1,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    // Same reasoning as lib/db/client.ts: a transaction pooler does not
    // keep a named prepared statement between statements.
    ...(isPooledConnection(url) ? { prepare: false } : {}),
    // The migration DDL is a wall of "identifier will be truncated" and
    // "already exists, skipping" notices. They are not findings.
    onnotice: () => {},
  });

  try {
    const before = await applied(sql);
    console.log(`Connected. ${before} already applied.`);
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_DIR });
    const after = await applied(sql);
    console.log(
      after === before
        ? "Nothing to do — the database is already at the latest migration."
        : `Applied ${after - before}. Now at ${after} of ${journal.entries.length}.`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(`\nMigration failed: ${error instanceof Error ? error.message : error}`);
    if (String(error).includes("CONNECT_TIMEOUT")) {
      console.error(
        "\nNothing answered on that host in time. Check the connection string is the\n" +
          "direct one rather than a copy of the psql command, that the password is in\n" +
          "it, and — on Neon's free tier — that the project is not suspended; opening\n" +
          "its console wakes it.",
      );
    }
    process.exit(1);
  },
);
