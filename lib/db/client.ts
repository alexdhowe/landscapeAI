/**
 * The Drizzle client — the only module that opens a database connection.
 *
 * Two drivers, one type:
 *
 *   DATABASE_URL      postgres.js against a real server. This is the
 *                     deployment path (section 3: Neon or Supabase).
 *   PGLITE_DATA_DIR   PGlite, Postgres compiled to wasm and run in-process.
 *                     "memory://" gives a disposable database per process,
 *                     which is how `npm test` exercises the DB path without
 *                     anyone having to run a server.
 *
 * With neither set there is no database and lib/store falls back to the
 * file store, so the demo runs on a clean checkout.
 *
 * Server-only.
 */
import { sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "./schema";

export type Schema = typeof schema;

/**
 * The driver-independent handle. Both postgres.js and PGlite hand back a
 * PgDatabase over the same schema, and nothing above this module should
 * know or care which one it got.
 */
export type Database = PgDatabase<
  PgQueryResultHKT,
  Schema,
  ExtractTablesWithRelations<Schema>
>;

/** Schema to isolate a connection in; a test run points this at a throwaway. */
export const dbSchemaName = (): string => process.env.DB_SCHEMA ?? "public";

/** True when a database is configured at all. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.PGLITE_DATA_DIR);
}

/**
 * Is this connection string pointed at a transaction-mode connection
 * pooler?
 *
 * It matters because postgres.js uses *named* prepared statements by
 * default, and PgBouncer in transaction mode hands a different backend
 * connection to each transaction — so the statement prepared a moment ago
 * is not there any more. The failure is "prepared statement does not
 * exist" on the second query, which reads like a database problem and is
 * not one.
 *
 * The free-tier deployments this repo documents are exactly where somebody
 * meets it: Neon's pooled host is `<project>-pooler.<region>…`, Supabase's
 * transaction pooler is port 6543, and the Prisma-era convention of
 * `?pgbouncer=true` is passed along by several providers. Detecting it and
 * turning prepared statements off costs a little per-query planning time
 * and turns a confusing outage into nothing at all.
 *
 * The direct (unpooled) endpoint is still the better connection string for
 * this app — one small instance opening at most `DATABASE_POOL_MAX`
 * connections has nothing to pool — which is what docs/deploy.md says to
 * use. This is the safety net for pasting the other one.
 */
export function isPooledConnection(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.hostname.includes("-pooler.") ||
    parsed.port === "6543" ||
    parsed.searchParams.get("pgbouncer") === "true"
  );
}

/**
 * Connection parameters libpq understands and a Postgres *server* does
 * not.
 *
 * postgres.js copies every query parameter it does not recognise as one of
 * its own options into the connection's startup packet — see
 * `parseOptions` in the driver, where `sslmode` is special-cased and
 * nothing else is. A startup packet naming something that is not a server
 * setting is refused: `unrecognized configuration parameter "..."`.
 *
 * That is not a hypothetical. Neon's console hands out
 * `...?sslmode=require&channel_binding=require` by default, and pasting it
 * where this repo asks for a connection string fails — and fails *badly*,
 * because `drizzle-kit migrate` does not report the error. It prints
 * "applying migrations..." and spins there indefinitely, which is exactly
 * the symptom an earlier session recorded as a drizzle-kit hang and worked
 * around with psql.
 *
 * So the paste is made to work rather than documented as a trap. These are
 * libpq's client-side parameters: they describe how the *client* connects,
 * they are meaningless to the server, and the driver either handles them
 * itself or cannot. Anything not on this list is left alone, because it
 * might be a real server setting the operator meant to send.
 */
const LIBPQ_CLIENT_ONLY_PARAMS = [
  "channel_binding",
  "connect_timeout",
  "fallback_application_name",
  "gssencmode",
  "gsslib",
  "hostaddr",
  "krbsrvname",
  "load_balance_hosts",
  "passfile",
  "requirepeer",
  "service",
  "ssl_max_protocol_version",
  "ssl_min_protocol_version",
  "sslcert",
  "sslcompression",
  "sslcrl",
  "sslcrldir",
  "sslkey",
  "sslpassword",
  "sslsni",
];

/**
 * The same connection string with the parameters above removed.
 *
 * Returns the input untouched when there is nothing to remove or when it
 * does not parse as a URL — a malformed string is the driver's to complain
 * about, with its own message, rather than this function's to swallow.
 */
export function normalizeConnectionUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  let changed = false;
  for (const name of LIBPQ_CLIENT_ONLY_PARAMS) {
    if (parsed.searchParams.has(name)) {
      parsed.searchParams.delete(name);
      changed = true;
    }
  }
  if (!changed) return url;
  // `URL.toString()` leaves a bare "?" behind once the last parameter
  // goes, which is harmless but reads like a truncated string in a log.
  return parsed.searchParams.size === 0
    ? parsed.toString().replace(/\?$/, "")
    : parsed.toString();
}

let handle: Promise<Database> | null = null;

async function connect(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const [{ default: postgres }, { drizzle }] = await Promise.all([
      import("postgres"),
      import("drizzle-orm/postgres-js"),
    ]);
    const schemaName = dbSchemaName();
    const client = postgres(normalizeConnectionUrl(url), {
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      // A disposable schema per test run needs the search path to follow
      // it. Deployments run in "public", which is already the default, so
      // the parameter is omitted entirely there rather than sent and
      // ignored — a startup parameter is one more thing a connection
      // pooler can refuse.
      ...(schemaName === "public" ? {} : { connection: { search_path: schemaName } }),
      // See isPooledConnection: named prepared statements do not survive a
      // pooler that hands out a different backend per transaction.
      ...(isPooledConnection(url) ? { prepare: false } : {}),
    });
    return drizzle(client, { schema }) as unknown as Database;
  }

  const dataDir = process.env.PGLITE_DATA_DIR;
  if (!dataDir) {
    throw new Error(
      "No database configured — set DATABASE_URL (or PGLITE_DATA_DIR) or leave both unset to use the file store",
    );
  }
  const [{ PGlite }, { drizzle }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
  ]);
  const db = drizzle(new PGlite(dataDir), { schema }) as unknown as Database;
  // A PGlite database is created empty every time this process starts, so
  // there is nothing to migrate onto — bring it up to the schema and give
  // it the one org. Real servers run `npm run db:setup` explicitly.
  const { applyMigrations } = await import("./migrate");
  const { seedOrganization } = await import("./seed");
  await applyMigrations(db);
  await seedOrganization(db);
  return db;
}

/** The process-wide client, opened on first use. */
export function getDb(): Promise<Database> {
  handle ??= connect().catch((error) => {
    handle = null;
    throw error;
  });
  return handle;
}

/** Drop the cached handle. Tests that re-point the env use this. */
export function resetDb(): void {
  handle = null;
}

/** `SELECT 1`, for a setup script to fail loudly on a bad URL. */
export async function ping(db: Database): Promise<void> {
  await db.execute(sql`select 1`);
}
