/**
 * Parsing what an admin form sends into the domain types.
 *
 * Strict on purpose: this is the one write path into the numbers every
 * estimate is built from, and a silently-coerced NaN here becomes a wrong
 * price in front of a customer. Anything malformed is rejected with a
 * message naming the field, never repaired.
 *
 * Pure. No I/O.
 */
import type { Assembly, AssemblyComponent, CostItem } from "../pricing/types";
import type { DisclosurePolicy, MarginConfig } from "../pricing/types";
import type { QuantityDistribution, RecipeLine } from "../pricing/typology";

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

const obj = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ParseError("Expected an object body");
  }
  return value as Record<string, unknown>;
};

function str(source: Record<string, unknown>, field: string, max = 200): string {
  const value = source[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ParseError(`"${field}" must be a non-empty string`);
  }
  if (value.length > max) throw new ParseError(`"${field}" is too long`);
  return value.trim();
}

function num(source: Record<string, unknown>, field: string): number {
  const value = source[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ParseError(`"${field}" must be a number`);
  }
  return value;
}

function optNum(source: Record<string, unknown>, field: string): number | undefined {
  const value = source[field];
  if (value === undefined || value === null || value === "") return undefined;
  return num(source, field);
}

function oneOf<T extends string>(
  source: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T {
  const value = source[field];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ParseError(`"${field}" must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function parseCostItem(body: unknown, sku: string): CostItem {
  const source = obj(body);
  return {
    id: sku,
    name: str(source, "name"),
    kind: oneOf(source, "kind", ["material", "labor", "equipment", "disposal"] as const),
    unit: oneOf(source, "unit", ["SF", "LF", "EA", "CY", "HR", "TON"] as const),
    unitCost: num(source, "unitCost"),
    ...(optNum(source, "burdenPct") === undefined
      ? {}
      : { burdenPct: optNum(source, "burdenPct")! }),
    ...(optNum(source, "wasteFactorPct") === undefined
      ? {}
      : { wasteFactorPct: optNum(source, "wasteFactorPct")! }),
  };
}

function parseComponent(raw: unknown, index: number): AssemblyComponent {
  const source = obj(raw);
  const qtyPerUnit = optNum(source, "qtyPerUnit");
  const productionRate = optNum(source, "productionRate");
  if ((qtyPerUnit === undefined) === (productionRate === undefined)) {
    throw new ParseError(
      `Component ${index + 1}: set either a quantity per unit or a production rate, not both`,
    );
  }
  return {
    costItemId: str(source, "costItemId"),
    ...(qtyPerUnit === undefined ? {} : { qtyPerUnit }),
    ...(productionRate === undefined ? {} : { productionRate }),
  };
}

export function parseAssembly(body: unknown, key: string): Assembly {
  const source = obj(body);
  const components = source.components;
  if (!Array.isArray(components)) throw new ParseError('"components" must be an array');
  if (components.length > 40) throw new ParseError("An assembly can have at most 40 components");
  return {
    id: key,
    name: str(source, "name"),
    unit: oneOf(source, "unit", ["SF", "LF", "EA", "CY"] as const),
    components: components.map(parseComponent),
  };
}

export function parseMargin(body: unknown): Partial<MarginConfig> {
  const source = obj(body);
  const out: Partial<MarginConfig> = {};
  for (const field of ["targetGmPct", "minGmPct", "contingencyPct"] as const) {
    const value = optNum(source, field);
    if (value !== undefined) out[field] = value;
  }
  return out;
}

export function parsePolicy(body: unknown): Partial<DisclosurePolicy> {
  const source = obj(body);
  const out: Partial<DisclosurePolicy> = {};
  if (source.mode !== undefined) {
    out.mode = oneOf(source, "mode", ["band", "tiers", "figure"] as const);
  }
  for (const field of ["bandWidthPct", "roundTo"] as const) {
    const value = optNum(source, field);
    if (value !== undefined) out[field] = value;
  }
  if (Array.isArray(source.tierMultipliers)) {
    out.tierMultipliers = source.tierMultipliers.map((raw) => {
      const tier = obj(raw);
      return { label: str(tier, "label", 40), multiplier: num(tier, "multiplier") };
    });
  }
  return out;
}

export function parseDistribution(body: unknown): QuantityDistribution {
  const source = obj(body);
  return {
    unit: oneOf(source, "unit", ["SF", "LF", "EA", "CY"] as const),
    p25: num(source, "p25"),
    p50: num(source, "p50"),
    p75: num(source, "p75"),
  };
}

export function parseRecipe(body: unknown): RecipeLine[] {
  const source = obj(body);
  const lines = source.lines;
  if (!Array.isArray(lines)) throw new ParseError('"lines" must be an array');
  if (lines.length > 40) throw new ParseError("A recipe can have at most 40 lines");
  return lines.map((raw) => {
    const line = obj(raw);
    return {
      assemblyId: str(line, "assemblyId"),
      distributionKey: str(line, "distributionKey"),
    };
  });
}
