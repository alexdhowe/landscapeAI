/**
 * Resolve the contractor org a request is being priced for.
 *
 * project-map section 5 makes Organization the tenant that owns the price
 * book. Routes ask for an org and get all of it — the book, the margin,
 * both disclosure policies, and the bid distributions behind the opening
 * band — at one revision.
 *
 * Two sources, mirroring the store's two backends:
 *
 *   with a database   the org's newest PUBLISHED revision, edited at
 *                     /pricebook and seeded from seed/pricebook.seed.ts
 *   without one       that file read directly, as revision 0, so the demo
 *                     runs on a clean checkout
 *
 * Either way the shape handed to lib/pricing is identical, and lib/pricing
 * still imports nothing from here — it takes the price book as an argument,
 * as it always has.
 *
 * Server-only.
 */
import { plantOptionsFor } from "../catalog/plants";
import { isDatabaseConfigured } from "../db/client";
import type { OrgPricing } from "../db/queries";
import {
  plantMetaBySku,
  wiBandPolicy,
  wiDistributions,
  wiFinalQuotePolicy,
  wiMarginConfig,
  wiOrganization,
  wiPriceBook,
  wiRecipes,
  wiTypologyConfig,
} from "../../seed/pricebook.seed";
import type { PricingConfig } from "../pricebook/types";

export type { OrgPricing } from "../db/queries";

/** The one org for now (section 5 allows many; the MVP ships one). */
export const DEFAULT_ORG_SLUG = wiOrganization.slug;

/**
 * How long a resolved book may be reused.
 *
 * Publishing invalidates this process's cache immediately, but a
 * deployment can run more than one process, and the others have no way to
 * hear about it. A short ceiling bounds how long a second instance can go
 * on pricing from the previous revision — seconds, not until restart.
 * A shared cache with real invalidation is the fix when there is more than
 * one box to care about.
 */
const CACHE_TTL_MS = 30_000;

/** The seed file read as data rather than as a runtime dependency. */
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

function seedOrg(): OrgPricing {
  return {
    id: wiOrganization.slug,
    slug: wiOrganization.slug,
    name: wiOrganization.name,
    // Revision 0 is the marker for "this book is the file, not a row".
    // /pricebook reads it and says so rather than offering an edit that has
    // nowhere to be saved.
    revisionId: "seed",
    revision: 0,
    revisionLabel: "Seed price book (no database)",
    publishedAt: null,
    priceBook: wiPriceBook,
    margin: wiMarginConfig,
    bandPolicy: wiBandPolicy,
    finalQuotePolicy: wiFinalQuotePolicy,
    typology: wiTypologyConfig,
    plantCatalog: plantOptionsFor(wiPriceBook, plantMetaBySku),
  };
}

type Entry = { at: number; value: Promise<OrgPricing> };
const cache = new Map<string, Entry>();

/** The org's current published book. */
export function resolveOrg(slug: string = DEFAULT_ORG_SLUG): Promise<OrgPricing> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const value = load(slug).catch((error) => {
    cache.delete(slug);
    throw error;
  });
  cache.set(slug, { at: Date.now(), value });
  return value;
}

async function load(slug: string): Promise<OrgPricing> {
  if (!isDatabaseConfigured()) return seedOrg();
  const [{ getDb }, { loadOrganization }] = await Promise.all([
    import("../db/client"),
    import("../db/queries"),
  ]);
  return loadOrganization(await getDb(), slug);
}

/**
 * The org's book as it stood on a date — never cached, because it is asked
 * about the past and the past does not change.
 *
 * This is the question a delta from March asks: not "what do we charge for
 * stone" but "what did we charge when this estimate was made".
 */
export async function resolveOrgAt(
  at: Date,
  slug: string = DEFAULT_ORG_SLUG,
): Promise<OrgPricing> {
  if (!isDatabaseConfigured()) return seedOrg();
  const [{ getDb }, { loadOrganizationAt }] = await Promise.all([
    import("../db/client"),
    import("../db/queries"),
  ]);
  return loadOrganizationAt(await getDb(), slug, at);
}

/** Drop the cached book. Publishing calls this. */
export function resetOrgCache(): void {
  cache.clear();
}
