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

let handle: Promise<Database> | null = null;

async function connect(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const [{ default: postgres }, { drizzle }] = await Promise.all([
      import("postgres"),
      import("drizzle-orm/postgres-js"),
    ]);
    const client = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      // A disposable schema per test run needs the search path to follow it;
      // in deployment this is "public" and the option is inert.
      connection: { search_path: dbSchemaName() },
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
