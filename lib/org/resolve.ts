/**
 * Resolve the contractor org a request is being priced for.
 *
 * project-map section 5 makes Organization the tenant that owns the price
 * book, the margin config and the disclosure policies. Routes ask for an
 * org and get all of it; they no longer import the seed constants
 * directly.
 *
 * Two sources, mirroring the store's two backends:
 *
 *   with a database   the org's own rows, seeded from
 *                     seed/pricebook.seed.ts by `npm run db:seed`
 *   without one       that same file read directly, so the demo runs on a
 *                     clean checkout
 *
 * Either way the shape handed to lib/pricing is identical, and lib/pricing
 * still imports nothing from here — it takes the price book as an argument,
 * as it always has.
 *
 * Server-only.
 */
import { isDatabaseConfigured } from "../db/client";
import type { OrgPricing } from "../db/queries";
import {
  wiBandPolicy,
  wiFinalQuotePolicy,
  wiMarginConfig,
  wiOrganization,
  wiPriceBook,
  wiTypologyConfig,
} from "../../seed/pricebook.seed";

export type { OrgPricing } from "../db/queries";

/** The one org for now (section 5 allows many; the MVP ships one). */
export const DEFAULT_ORG_SLUG = wiOrganization.slug;

/**
 * The seed file read as data rather than as a runtime dependency of the
 * pricing routes. Only reachable when no database is configured.
 */
function seedOrg(): OrgPricing {
  return {
    id: wiOrganization.slug,
    slug: wiOrganization.slug,
    name: wiOrganization.name,
    priceBook: wiPriceBook,
    margin: wiMarginConfig,
    bandPolicy: wiBandPolicy,
    finalQuotePolicy: wiFinalQuotePolicy,
    typology: wiTypologyConfig,
  };
}

const cache = new Map<string, Promise<OrgPricing>>();

/**
 * The org's pricing configuration, read once per process.
 *
 * A price book changes when a contractor edits it, which is the /pricebook
 * admin surface and its own session; when that lands it invalidates this
 * cache on write. Until then the rows only change when someone re-seeds.
 */
export function resolveOrg(slug: string = DEFAULT_ORG_SLUG): Promise<OrgPricing> {
  let pending = cache.get(slug);
  if (!pending) {
    pending = load(slug).catch((error) => {
      cache.delete(slug);
      throw error;
    });
    cache.set(slug, pending);
  }
  return pending;
}

async function load(slug: string): Promise<OrgPricing> {
  if (!isDatabaseConfigured()) return seedOrg();
  const [{ getDb }, { loadOrganization }] = await Promise.all([
    import("../db/client"),
    import("../db/queries"),
  ]);
  return loadOrganization(await getDb(), slug);
}

/** Drop the cached configuration. For tests and, later, price-book edits. */
export function resetOrgCache(): void {
  cache.clear();
}
