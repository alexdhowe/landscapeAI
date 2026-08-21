/**
 * Load the contractor org from seed/pricebook.seed.ts.
 *
 * That file stays what project-map section 7 describes: the WI placeholder
 * price book, plant metadata, margins, disclosure policies and quantity
 * distributions, in one place, to be replaced wholesale when real bids
 * arrive. What changes here is its role — it is seed INPUT now, not a
 * runtime import. Routes read the org's rows; only this module reads the
 * file.
 *
 * Idempotent: an org that already exists is left exactly as it is, because
 * its rows may have been edited since (the /pricebook admin surface is its
 * own session) and re-seeding would silently undo that.
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
import type { JobType, MarketContext } from "../pricing/typology";

import type { Database } from "./client";
import {
  assemblies,
  assemblyComponents,
  costItems,
  disclosurePolicies,
  marginConfigs,
  organizations,
  typologyDistributions,
  typologyRecipes,
} from "./schema";

export const SEED_ORG_SLUG = wiOrganization.slug;

/**
 * Ensure the seed org exists. Returns its id either way.
 */
export async function seedOrganization(db: Database): Promise<string> {
  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.slug, wiOrganization.slug),
  });
  if (existing) return existing.id;

  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ slug: wiOrganization.slug, name: wiOrganization.name })
      .returning({ id: organizations.id });
    const orgId = org.id;

    await tx.insert(costItems).values(
      wiPriceBook.costItems.map((item) => ({
        orgId,
        sku: item.id,
        name: item.name,
        kind: item.kind,
        unit: item.unit,
        unitCost: item.unitCost,
        burdenPct: item.burdenPct ?? null,
        wasteFactorPct: item.wasteFactorPct ?? null,
        // Mandatory at seed time for living SKUs — the time slider cannot
        // exist without it and it cannot be backfilled from a bid.
        plantMeta: plantMetaBySku[item.id] ?? null,
      })),
    );

    await tx.insert(assemblies).values(
      wiPriceBook.assemblies.map((assembly) => ({
        orgId,
        key: assembly.id,
        name: assembly.name,
        unit: assembly.unit,
      })),
    );

    await tx.insert(assemblyComponents).values(
      wiPriceBook.assemblies.flatMap((assembly) =>
        assembly.components.map((component, position) => ({
          orgId,
          assemblyKey: assembly.id,
          position,
          costItemSku: component.costItemId,
          qtyPerUnit: component.qtyPerUnit ?? null,
          productionRate: component.productionRate ?? null,
        })),
      ),
    );

    await tx.insert(marginConfigs).values({ orgId, ...wiMarginConfig });

    await tx.insert(disclosurePolicies).values(
      (
        [
          ["band", wiBandPolicy],
          ["final_quote", wiFinalQuotePolicy],
        ] as const
      ).map(([role, policy]) => ({
        orgId,
        role,
        mode: policy.mode,
        bandWidthPct: policy.bandWidthPct,
        showUnitRates: policy.showUnitRates,
        roundTo: policy.roundTo,
        tierMultipliers: policy.tierMultipliers ?? null,
      })),
    );

    const distributionRows = Object.entries(wiDistributions).flatMap(
      ([jobType, byContext]) =>
        Object.entries(byContext).flatMap(([marketContext, byKey]) =>
          Object.entries(byKey).map(([distributionKey, distribution]) => ({
            orgId,
            jobType: jobType as JobType,
            marketContext: marketContext as MarketContext,
            distributionKey,
            unit: distribution.unit,
            p25: distribution.p25,
            p50: distribution.p50,
            p75: distribution.p75,
          })),
        ),
    );
    await tx.insert(typologyDistributions).values(distributionRows);

    const recipeRows = Object.entries(wiRecipes).flatMap(([jobType, lines]) =>
      lines.map((line, position) => ({
        orgId,
        jobType: jobType as JobType,
        position,
        assemblyKey: line.assemblyId,
        distributionKey: line.distributionKey,
      })),
    );
    await tx.insert(typologyRecipes).values(recipeRows);

    return orgId;
  });
}
