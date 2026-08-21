/**
 * What changed between two revisions.
 *
 * This is the edit history. Revisions are immutable, so the history does
 * not need a separate log to be trustworthy — the diff between two frozen
 * documents IS what happened, and it cannot disagree with the rows the way
 * an audit table can drift from them.
 *
 * Field-level, because "mulch went from $38 to $46" is the sentence a
 * contractor wants and "cost_items changed" is not.
 *
 * Pure. No I/O.
 */
import type { JobType, MarketContext } from "../pricing/typology";

import type { PricingConfig } from "./types";

export type ChangeKind = "added" | "removed" | "changed";

export type FieldChange = {
  field: string;
  before: unknown;
  after: unknown;
};

export type EntityChange = {
  kind: ChangeKind;
  /** "Cost item", "Assembly", "Margin"… for display. */
  entity: string;
  /** The thing's id, or the setting's name. */
  key: string;
  label: string;
  /** Empty for added/removed; populated for changed. */
  fields: FieldChange[];
};

const JOB_TYPES: JobType[] = [
  "bed_renovation",
  "mulch_to_stone",
  "foundation_planting_refresh",
];
const CONTEXTS: MarketContext[] = ["residential", "hoa_commercial"];

/** Compare two flat records, ignoring keys that are absent on both sides. */
function fieldChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const field of fields) {
    const a = before[field];
    const b = after[field];
    if (a === b) continue;
    if (a === undefined && b === undefined) continue;
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    out.push({ field, before: a ?? null, after: b ?? null });
  }
  return out;
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

const COST_ITEM_FIELDS = [
  "name",
  "kind",
  "unit",
  "unitCost",
  "burdenPct",
  "wasteFactorPct",
];

/**
 * Every difference from `before` to `after`, grouped by the thing that
 * changed. An empty list means the two revisions price identically.
 */
export function diffPricingConfig(
  before: PricingConfig,
  after: PricingConfig,
): EntityChange[] {
  const changes: EntityChange[] = [];

  // --- cost items --------------------------------------------------------
  const beforeItems = byId(before.priceBook.costItems);
  const afterItems = byId(after.priceBook.costItems);
  for (const [id, item] of afterItems) {
    const old = beforeItems.get(id);
    if (!old) {
      changes.push({ kind: "added", entity: "Cost item", key: id, label: item.name, fields: [] });
      continue;
    }
    const fields = fieldChanges(
      old as unknown as Record<string, unknown>,
      item as unknown as Record<string, unknown>,
      COST_ITEM_FIELDS,
    );
    if (fields.length > 0) {
      changes.push({ kind: "changed", entity: "Cost item", key: id, label: item.name, fields });
    }
  }
  for (const [id, item] of beforeItems) {
    if (!afterItems.has(id)) {
      changes.push({ kind: "removed", entity: "Cost item", key: id, label: item.name, fields: [] });
    }
  }

  // --- assemblies, components included -----------------------------------
  const beforeAsm = byId(before.priceBook.assemblies);
  const afterAsm = byId(after.priceBook.assemblies);
  for (const [id, assembly] of afterAsm) {
    const old = beforeAsm.get(id);
    if (!old) {
      changes.push({ kind: "added", entity: "Assembly", key: id, label: assembly.name, fields: [] });
      continue;
    }
    const fields = fieldChanges(
      old as unknown as Record<string, unknown>,
      assembly as unknown as Record<string, unknown>,
      ["name", "unit"],
    );
    // Components are compared as a whole: their order is part of the bid,
    // so a reorder is a real change, not noise to normalize away.
    if (JSON.stringify(old.components) !== JSON.stringify(assembly.components)) {
      fields.push({ field: "components", before: old.components, after: assembly.components });
    }
    if (fields.length > 0) {
      changes.push({ kind: "changed", entity: "Assembly", key: id, label: assembly.name, fields });
    }
  }
  for (const [id, assembly] of beforeAsm) {
    if (!afterAsm.has(id)) {
      changes.push({ kind: "removed", entity: "Assembly", key: id, label: assembly.name, fields: [] });
    }
  }

  // --- plant metadata ----------------------------------------------------
  for (const sku of new Set([
    ...Object.keys(before.plantMeta),
    ...Object.keys(after.plantMeta),
  ])) {
    const a = before.plantMeta[sku];
    const b = after.plantMeta[sku];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    changes.push({
      kind: a === undefined ? "added" : b === undefined ? "removed" : "changed",
      entity: "Plant metadata",
      key: sku,
      label: afterItems.get(sku)?.name ?? beforeItems.get(sku)?.name ?? sku,
      fields: a && b ? fieldChanges(a as unknown as Record<string, unknown>, b as unknown as Record<string, unknown>,
        ["installSize", "matureHeightFt", "matureSpreadFt", "growthRateClass", "form", "hardinessZone", "foliage", "category"]) : [],
    });
  }

  // --- margin and disclosure ---------------------------------------------
  const marginFields = fieldChanges(
    before.margin as unknown as Record<string, unknown>,
    after.margin as unknown as Record<string, unknown>,
    ["targetGmPct", "minGmPct", "contingencyPct"],
  );
  if (marginFields.length > 0) {
    changes.push({
      kind: "changed",
      entity: "Margin",
      key: "margin",
      label: "Margin and contingency",
      fields: marginFields,
    });
  }

  for (const [key, label, a, b] of [
    ["bandPolicy", "Opening band disclosure", before.bandPolicy, after.bandPolicy],
    ["finalQuotePolicy", "Final quote disclosure", before.finalQuotePolicy, after.finalQuotePolicy],
  ] as const) {
    const fields = fieldChanges(
      a as unknown as Record<string, unknown>,
      b as unknown as Record<string, unknown>,
      ["mode", "bandWidthPct", "roundTo", "tierMultipliers"],
    );
    if (fields.length > 0) {
      changes.push({ kind: "changed", entity: "Disclosure", key, label, fields });
    }
  }

  // --- typology ----------------------------------------------------------
  for (const jobType of JOB_TYPES) {
    if (
      JSON.stringify(before.recipes[jobType] ?? []) !==
      JSON.stringify(after.recipes[jobType] ?? [])
    ) {
      changes.push({
        kind: "changed",
        entity: "Recipe",
        key: `recipes.${jobType}`,
        label: jobType,
        fields: [
          { field: "lines", before: before.recipes[jobType], after: after.recipes[jobType] },
        ],
      });
    }
    for (const context of CONTEXTS) {
      const a = before.distributions[jobType]?.[context] ?? {};
      const b = after.distributions[jobType]?.[context] ?? {};
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (JSON.stringify(a[key]) === JSON.stringify(b[key])) continue;
        changes.push({
          kind: a[key] === undefined ? "added" : b[key] === undefined ? "removed" : "changed",
          entity: "Distribution",
          key: `${jobType}.${context}.${key}`,
          label: `${jobType} · ${context} · ${key}`,
          fields: [{ field: "percentiles", before: a[key] ?? null, after: b[key] ?? null }],
        });
      }
    }
  }

  return changes;
}

/** One line of English per change, for a history list. */
export function describeChange(change: EntityChange): string {
  const what = `${change.entity} "${change.label}"`;
  if (change.kind === "added") return `Added ${what}`;
  if (change.kind === "removed") return `Removed ${what}`;
  const fields = change.fields
    .map((f) => {
      const before = typeof f.before === "object" ? "…" : String(f.before);
      const after = typeof f.after === "object" ? "…" : String(f.after);
      return `${f.field} ${before} → ${after}`;
    })
    .join(", ");
  return `${what}: ${fields}`;
}
