/**
 * Load the contractor org from seed/pricebook.seed.ts.
 *
 * That file stays what project-map section 7 describes: the WI placeholder
 * price book, plant metadata, margins, disclosure policies and quantity
 * distributions, in one place, to be replaced wholesale when real bids
 * arrive. What changed is its role — it is seed INPUT, not a runtime
 * import. Routes read the org's rows; only this module reads the file.
 *
 * The seeded book becomes the org's **revision 1, published**. Everything
 * after that is edited at /pricebook, which is why this is idempotent: an
 * org that already exists is left exactly as it is, because its book has
 * almost certainly moved on since.
 *
 * Server-only.
 */
import { eq } from "drizzle-orm";

import {
  plantMetaBySku,
  wiBandPolicy,
  wiDistributions,
  wiFinalQuotePolicy,
  wiMarginConfig,
  wiOrganization,
  wiPriceBook,
  wiRecipes,
} from "../../seed/pricebook.seed";
import type { PricingConfig } from "../pricebook/types";

import type { Database } from "./client";
import { writeRevisionConfig } from "./queries";
import { organizations, priceBookRevisions } from "./schema";

export const SEED_ORG_SLUG = wiOrganization.slug;

/** The seed file, in the shape a revision holds. */
export function seedPricingConfig(): PricingConfig {
  return {
    priceBook: wiPriceBook,
    plantMeta: plantMetaBySku,
    margin: wiMarginConfig,
    bandPolicy: wiBandPolicy,
    finalQuotePolicy: wiFinalQuotePolicy,
    recipes: wiRecipes,
    distributions: wiDistributions,
  };
}

/** Ensure the seed org and its revision 1 exist. Returns the org id. */
export async function seedOrganization(db: Database): Promise<string> {
  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.slug, wiOrganization.slug),
  });
  if (existing) return existing.id;

  const [org] = await db
    .insert(organizations)
    .values({ slug: wiOrganization.slug, name: wiOrganization.name })
    .returning({ id: organizations.id });

  const now = new Date();
  const [revision] = await db
    .insert(priceBookRevisions)
    .values({
      orgId: org.id,
      revision: 1,
      status: "draft", // published below, once its contents are in
      label: "Initial price book",
      note: "Seeded from seed/pricebook.seed.ts — Wisconsin state-average placeholders.",
      createdBy: "system",
      createdAt: now,
    })
    .returning();

  await writeRevisionConfig(db, revision.id, seedPricingConfig());
  await db
    .update(priceBookRevisions)
    .set({ status: "published", publishedBy: "system", publishedAt: now })
    .where(eq(priceBookRevisions.id, revision.id));

  return org.id;
}
