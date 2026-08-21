/**
 * Looking a contractor up, from whichever store is configured.
 *
 * Mirrors lib/store: with a database, contractors are rows on the org.
 * Without one there is no user table, so a single login can be configured
 * by environment — the same shape of labeled fallback the demo
 * segmentation and the demo geocoder already use. If it isn't configured,
 * nobody can sign in and the console stays shut; there is no default
 * password anywhere in this repo.
 *
 * Server-only.
 */
import { eq } from "drizzle-orm";

import { isDatabaseConfigured } from "../db/client";
import { DEFAULT_ORG_SLUG, resolveOrg } from "../org/resolve";

import { hashPassword, verifyPassword } from "./password";
import type { Contractor } from "./types";

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase().normalize("NFKC");

/** The env-configured single login used when no database is present. */
function envContractor(): { contractor: Contractor; password: string } | null {
  const email = process.env.CONTRACTOR_EMAIL;
  const password = process.env.CONTRACTOR_PASSWORD;
  if (!email || !password) return null;
  return {
    contractor: {
      id: "env-contractor",
      email: normalizeEmail(email),
      name: process.env.CONTRACTOR_NAME ?? "Contractor",
      role: "admin",
      orgId: DEFAULT_ORG_SLUG,
    },
    password,
  };
}

/**
 * True when someone could sign in at all. The login page reads this so it
 * can say "no login is configured" rather than "wrong password" forever.
 */
export function isLoginConfigured(): boolean {
  return isDatabaseConfigured() || envContractor() !== null;
}

/**
 * Verify a credential pair.
 *
 * Returns null for every failure — unknown address, wrong password,
 * unconfigured login — because telling them apart tells an attacker which
 * addresses exist.
 */
export async function authenticate(
  rawEmail: string,
  password: string,
): Promise<Contractor | null> {
  const email = normalizeEmail(rawEmail);
  if (email.length === 0 || password.length === 0) return null;

  if (!isDatabaseConfigured()) {
    const env = envContractor();
    if (!env || env.contractor.email !== email) return null;
    // Constant-time compare via the same primitive the DB path uses, so
    // the two paths cannot diverge in timing behaviour.
    const ok = await verifyPassword(password, await hashPassword(env.password));
    return ok ? env.contractor : null;
  }

  const [{ getDb }, { users }] = await Promise.all([
    import("../db/client"),
    import("../db/schema"),
  ]);
  const db = await getDb();
  const row = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!row) return null;
  if (!(await verifyPassword(password, row.passwordHash))) return null;

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, row.id));

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    orgId: row.orgId,
  };
}

/**
 * Create or update a contractor login. Used by `npm run db:user`; there is
 * no self-service signup, because the contractor console is not a place
 * strangers get accounts.
 */
export async function upsertContractor(input: {
  email: string;
  name: string;
  password: string;
  role?: Contractor["role"];
}): Promise<Contractor> {
  if (!isDatabaseConfigured()) {
    throw new Error(
      "No DATABASE_URL set — without a database, configure the single login with CONTRACTOR_EMAIL and CONTRACTOR_PASSWORD",
    );
  }
  const [{ getDb }, { users }] = await Promise.all([
    import("../db/client"),
    import("../db/schema"),
  ]);
  const [db, org] = await Promise.all([getDb(), resolveOrg()]);
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  const [row] = await db
    .insert(users)
    .values({
      orgId: org.id,
      email,
      name: input.name,
      passwordHash,
      role: input.role ?? "rep",
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: input.name, passwordHash, role: input.role ?? "rep" },
    })
    .returning();

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    orgId: row.orgId,
  };
}
