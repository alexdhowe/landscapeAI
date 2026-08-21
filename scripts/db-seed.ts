/**
 * Load the contractor org and its price book into the configured database.
 *
 *   npm run db:setup    # migrate, then seed
 *
 * Idempotent: an org that already exists is left alone. Reads
 * seed/pricebook.seed.ts, which stays the single source of the WI
 * placeholder data (project-map section 7) — this is what turns it from a
 * runtime import into seed input.
 */
import { getDb, isDatabaseConfigured, ping } from "../lib/db/client";
import { SEED_ORG_SLUG, seedOrganization } from "../lib/db/seed";

async function main() {
  if (!isDatabaseConfigured()) {
    console.error(
      "No DATABASE_URL set. The app runs on the file store without one; set it to seed a database.",
    );
    process.exitCode = 1;
    return;
  }
  const db = await getDb();
  await ping(db);
  const orgId = await seedOrganization(db);
  console.log(`Organization "${SEED_ORG_SLUG}" ready: ${orgId}`);
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
