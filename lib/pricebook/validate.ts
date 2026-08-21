/**
 * What a price book has to be true of before it can be published.
 *
 * A draft is free to be broken — that is what a draft is for. Publishing is
 * the moment it starts pricing real estimates, so this is the gate, and it
 * enforces the one thing section 1 is least willing to lose:
 *
 *   **The catalog is the guardrail.** Every option a customer can click
 *   must map to assemblies and SKUs that exist. A book that deletes an
 *   assembly the configurator offers has sold something the engine cannot
 *   price, and the customer finds out at the worst possible moment. So it
 *   cannot be published.
 *
 * Errors block a publish. Warnings do not — a SKU nothing uses yet is a
 * contractor mid-thought, not a mistake.
 *
 * Pure. No I/O, no database, no imports from app/.
 */
import { CATALOG_OPTIONS } from "../catalog/options";
import type { JobType, MarketContext } from "../pricing/typology";
import type { QuantityUnit } from "../pricing/types";

import type { PricingConfig } from "./types";

export type IssueSeverity = "error" | "warning";

export type ValidationIssue = {
  severity: IssueSeverity;
  /** Stable machine code, so a UI can group without matching on prose. */
  code: string;
  /** Where it is, e.g. "costItems.mulch_hardwood" or "assemblies.x.components[2]". */
  path: string;
  message: string;
};

const UNITS: QuantityUnit[] = ["SF", "LF", "EA", "CY"];
const COST_UNITS = [...UNITS, "HR", "TON"];
const KINDS = ["material", "labor", "equipment", "disposal"];
const JOB_TYPES: JobType[] = [
  "bed_renovation",
  "mulch_to_stone",
  "foundation_planting_refresh",
];
const CONTEXTS: MarketContext[] = ["residential", "hoa_commercial"];

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * Every problem with this configuration, worst first. An empty list means
 * it is publishable.
 */
export function validatePricingConfig(config: PricingConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (code: string, path: string, message: string) =>
    issues.push({ severity: "error", code, path, message });
  const warn = (code: string, path: string, message: string) =>
    issues.push({ severity: "warning", code, path, message });

  const { priceBook, margin, bandPolicy, finalQuotePolicy, recipes, distributions } =
    config;

  // --- cost items --------------------------------------------------------
  const skus = new Set<string>();
  for (const item of priceBook.costItems) {
    const path = `costItems.${item.id}`;
    if (!item.id || !/^[a-z0-9_]+$/i.test(item.id)) {
      error("sku_invalid", path, `"${item.id}" is not a usable SKU id (letters, digits and underscores).`);
    }
    if (skus.has(item.id)) {
      error("sku_duplicate", path, `SKU "${item.id}" appears more than once.`);
    }
    skus.add(item.id);
    if (!item.name?.trim()) error("name_required", path, "A cost item needs a name.");
    if (!KINDS.includes(item.kind)) {
      error("kind_invalid", path, `"${item.kind}" is not a cost item kind.`);
    }
    if (!COST_UNITS.includes(item.unit)) {
      error("unit_invalid", path, `"${item.unit}" is not a unit this engine prices in.`);
    }
    if (!finite(item.unitCost) || item.unitCost < 0) {
      error("unit_cost_invalid", path, "Unit cost must be zero or more.");
    }
    for (const [key, max] of [
      ["burdenPct", 300],
      ["wasteFactorPct", 200],
    ] as const) {
      const value = item[key];
      if (value === undefined) continue;
      if (!finite(value) || value < 0 || value > max) {
        error(`${key}_invalid`, path, `${key} must be between 0 and ${max}.`);
      }
    }
    if (item.kind === "labor" && item.burdenPct === undefined) {
      warn(
        "labor_without_burden",
        path,
        "Labor with no burden percentage prices at raw wage — taxes, insurance and benefits are missing.",
      );
    }
  }

  // --- assemblies and their components -----------------------------------
  const assemblyKeys = new Set<string>();
  const usedSkus = new Set<string>();
  for (const assembly of priceBook.assemblies) {
    const path = `assemblies.${assembly.id}`;
    if (!assembly.id || !/^[a-z0-9_]+$/i.test(assembly.id)) {
      error("assembly_invalid", path, `"${assembly.id}" is not a usable assembly id.`);
    }
    if (assemblyKeys.has(assembly.id)) {
      error("assembly_duplicate", path, `Assembly "${assembly.id}" appears more than once.`);
    }
    assemblyKeys.add(assembly.id);
    if (!assembly.name?.trim()) error("name_required", path, "An assembly needs a name.");
    if (!UNITS.includes(assembly.unit)) {
      error("unit_invalid", path, `"${assembly.unit}" is not an assembly unit.`);
    }
    if (assembly.components.length === 0) {
      error("assembly_empty", path, "An assembly with no components prices at zero.");
    }
    assembly.components.forEach((component, i) => {
      const cpath = `${path}.components[${i}]`;
      if (!skus.has(component.costItemId)) {
        error(
          "component_unknown_sku",
          cpath,
          `References SKU "${component.costItemId}", which is not in this price book.`,
        );
      }
      usedSkus.add(component.costItemId);
      const hasQty = component.qtyPerUnit !== undefined;
      const hasRate = component.productionRate !== undefined;
      if (hasQty === hasRate) {
        error(
          "component_rate_ambiguous",
          cpath,
          hasQty
            ? "Set either a quantity per unit or a production rate, not both."
            : "Set a quantity per unit, or a production rate for labor and equipment.",
        );
      }
      if (hasQty && (!finite(component.qtyPerUnit) || component.qtyPerUnit! <= 0)) {
        error("component_qty_invalid", cpath, "Quantity per unit must be greater than zero.");
      }
      if (hasRate && (!finite(component.productionRate) || component.productionRate! <= 0)) {
        error(
          "component_rate_invalid",
          cpath,
          "Production rate must be greater than zero — it divides into the quantity.",
        );
      }
    });
  }
  for (const sku of skus) {
    if (!usedSkus.has(sku)) {
      warn("sku_unused", `costItems.${sku}`, "No assembly uses this SKU, so nothing prices it.");
    }
  }

  // --- the guardrail (project-map section 1) -----------------------------
  for (const option of CATALOG_OPTIONS) {
    for (const assemblyId of option.assemblyIds) {
      if (!assemblyKeys.has(assemblyId)) {
        error(
          "catalog_orphaned_assembly",
          `catalog.${option.id}`,
          `"${option.label}" is offered in the configurator but assembly "${assemblyId}" is not in this book. Customers could pick something you cannot price.`,
        );
      }
    }
    for (const skuId of option.skuIds) {
      if (!skus.has(skuId)) {
        error(
          "catalog_orphaned_sku",
          `catalog.${option.id}`,
          `"${option.label}" names SKU "${skuId}", which is not in this book.`,
        );
      }
    }
  }

  // --- typology: the opening band ----------------------------------------
  for (const jobType of JOB_TYPES) {
    const lines = recipes[jobType] ?? [];
    if (lines.length === 0) {
      error("recipe_empty", `recipes.${jobType}`, "No recipe, so this job type has no opening band.");
    }
    lines.forEach((line, i) => {
      const path = `recipes.${jobType}[${i}]`;
      if (!assemblyKeys.has(line.assemblyId)) {
        error(
          "recipe_unknown_assembly",
          path,
          `References assembly "${line.assemblyId}", which is not in this book.`,
        );
      }
      for (const context of CONTEXTS) {
        if (!distributions[jobType]?.[context]?.[line.distributionKey]) {
          error(
            "recipe_unknown_distribution",
            path,
            `No ${context} distribution for "${line.distributionKey}" — the ${jobType} band cannot be computed.`,
          );
        }
      }
    });
  }
  for (const jobType of JOB_TYPES) {
    for (const context of CONTEXTS) {
      for (const [key, d] of Object.entries(distributions[jobType]?.[context] ?? {})) {
        const path = `distributions.${jobType}.${context}.${key}`;
        if (![d.p25, d.p50, d.p75].every((n) => finite(n) && n > 0)) {
          error("distribution_invalid", path, "Percentiles must all be greater than zero.");
        } else if (!(d.p25 <= d.p50 && d.p50 <= d.p75)) {
          error("distribution_unordered", path, "Percentiles must be ordered P25 ≤ P50 ≤ P75.");
        }
        if (!UNITS.includes(d.unit)) {
          error("unit_invalid", path, `"${d.unit}" is not a quantity unit.`);
        }
      }
    }
  }

  // --- margin ------------------------------------------------------------
  const { targetGmPct, minGmPct, contingencyPct } = margin;
  if (!finite(targetGmPct) || targetGmPct < 0 || targetGmPct >= 100) {
    error("margin_target_invalid", "margin.targetGmPct", "Target gross margin must be between 0 and 100.");
  }
  if (!finite(minGmPct) || minGmPct < 0 || minGmPct >= 100) {
    error("margin_min_invalid", "margin.minGmPct", "Floor gross margin must be between 0 and 100.");
  }
  if (finite(targetGmPct) && finite(minGmPct) && minGmPct > targetGmPct) {
    error(
      "margin_floor_above_target",
      "margin.minGmPct",
      "The floor is above the target, so the clamp would raise every price above what you aim for.",
    );
  }
  if (!finite(contingencyPct) || contingencyPct < 0 || contingencyPct > 100) {
    error("contingency_invalid", "margin.contingencyPct", "Contingency must be between 0 and 100.");
  }

  // --- disclosure --------------------------------------------------------
  for (const [role, policy] of [
    ["bandPolicy", bandPolicy],
    ["finalQuotePolicy", finalQuotePolicy],
  ] as const) {
    if (policy.showUnitRates !== false) {
      error(
        "disclosure_leaks_rates",
        `${role}.showUnitRates`,
        "Unit rates must never reach a customer surface.",
      );
    }
    if (!Number.isInteger(policy.roundTo) || policy.roundTo <= 0) {
      error("round_to_invalid", `${role}.roundTo`, "Rounding increment must be a positive whole number.");
    }
    if (!finite(policy.bandWidthPct) || policy.bandWidthPct < 0 || policy.bandWidthPct > 100) {
      error("band_width_invalid", `${role}.bandWidthPct`, "Band width must be between 0 and 100.");
    }
    if (policy.mode === "band" && policy.bandWidthPct === 0) {
      warn(
        "band_width_zero",
        `${role}.bandWidthPct`,
        "A band of zero width is a figure wearing a band's clothes.",
      );
    }
    if (policy.mode === "tiers" && (policy.tierMultipliers ?? []).length < 2) {
      error(
        "tiers_missing",
        `${role}.tierMultipliers`,
        "Tier mode needs at least two tiers.",
      );
    }
  }

  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
}

/** A configuration is publishable when nothing is wrong enough to block it. */
export function canPublish(issues: ValidationIssue[]): boolean {
  return !issues.some((issue) => issue.severity === "error");
}
