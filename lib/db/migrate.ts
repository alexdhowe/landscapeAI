/**
 * Replay the generated migrations against a database.
 *
 * `npm run db:migrate` uses drizzle-kit, which keeps its own journal table
 * and is what a real deployment runs. This is the same SQL applied to a
 * database that is empty by construction — an in-memory PGlite, or the
 * disposable schema a test run creates and drops — where a journal would
 * only be a second source of truth to get out of sync.
 *
 * Server-only.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { sql } from "drizzle-orm";

import type { Database } from "./client";

type Journal = { entries: { idx: number; tag: string }[] };

export const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/**
 * The generated migrations, in journal order.
 *
 * drizzle-kit writes unqualified CREATE TABLE but schema-qualifies the
 * foreign keys it points at ("public"."organizations"), which pins the
 * whole migration to one schema. `targetSchema` re-points those references
 * so a test run can raise the identical schema inside a disposable one and
 * drop it whole afterwards. Deployments pass nothing and get the SQL
 * verbatim.
 */
export async function migrationStatements(
  dir = MIGRATIONS_DIR,
  targetSchema = "public",
): Promise<string[]> {
  const journal = JSON.parse(
    await fs.readFile(path.join(dir, "meta", "_journal.json"), "utf8"),
  ) as Journal;
  const statements: string[] = [];
  for (const entry of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
    const file = await fs.readFile(path.join(dir, `${entry.tag}.sql`), "utf8");
    for (const statement of file.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed.length === 0) continue;
      statements.push(
        targetSchema === "public"
          ? trimmed
          : trimmed.replaceAll('"public".', `"${targetSchema}".`),
      );
    }
  }
  return statements;
}

export async function applyMigrations(
  db: Database,
  { dir = MIGRATIONS_DIR, targetSchema = "public" } = {},
): Promise<void> {
  for (const statement of await migrationStatements(dir, targetSchema)) {
    await db.execute(sql.raw(statement));
  }
}
