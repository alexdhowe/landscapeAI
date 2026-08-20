/**
 * Data model per project-map section 5.
 *
 * Geometry and frozen payloads live in JSONB for the MVP. The image is a
 * view; these rows are the artifact. Every quantity column stores the full
 * Quantity object (value + unit + source + confidence + capturedAt) — never
 * a bare number.
 */
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const costItems = pgTable("cost_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["material", "labor", "equipment", "disposal"] }).notNull(),
  unit: text("unit").notNull(),
  unitCost: doublePrecision("unit_cost").notNull(),
  burdenPct: doublePrecision("burden_pct"),
  wasteFactorPct: doublePrecision("waste_factor_pct"),
  // Plant metadata for living SKUs (null for non-plant items). Captured at
  // seed time — the time slider cannot exist without it.
  plantMeta: jsonb("plant_meta"),
});

export const assemblies = pgTable("assemblies", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
});

export const assemblyComponents = pgTable("assembly_components", {
  id: uuid("id").primaryKey().defaultRandom(),
  assemblyId: uuid("assembly_id")
    .notNull()
    .references(() => assemblies.id),
  costItemId: uuid("cost_item_id")
    .notNull()
    .references(() => costItems.id),
  qtyPerUnit: doublePrecision("qty_per_unit"),
  productionRate: doublePrecision("production_rate"),
});

export const marginConfigs = pgTable("margin_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  targetGmPct: doublePrecision("target_gm_pct").notNull(),
  minGmPct: doublePrecision("min_gm_pct").notNull(),
  contingencyPct: doublePrecision("contingency_pct").notNull(),
});

export const disclosurePolicies = pgTable("disclosure_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  mode: text("mode", { enum: ["band", "tiers", "figure"] }).notNull(),
  bandWidthPct: doublePrecision("band_width_pct"),
  showUnitRates: boolean("show_unit_rates").notNull().default(false),
  roundTo: integer("round_to").notNull().default(50),
  tierMultipliers: jsonb("tier_multipliers"),
});

export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  address: text("address"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  parcelGeom: jsonb("parcel_geom"),
  imagerySource: text("imagery_source"),
  imageryCapturedAt: timestamp("imagery_captured_at", { withTimezone: true }),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").references(() => properties.id),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  status: text("status", {
    enum: ["playing", "located", "submitted", "confirmed", "quoted"],
  })
    .notNull()
    .default("playing"),
  customerContact: jsonb("customer_contact"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const regions = pgTable("regions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  geom: jsonb("geom"),
  kind: text("kind", {
    enum: ["bed", "turf", "hardscape", "foundation_planting"],
  }).notNull(),
  quantity: jsonb("quantity"),
  existingMaterial: text("existing_material"),
});

export const selections = pgTable("selections", {
  id: uuid("id").primaryKey().defaultRandom(),
  regionId: uuid("region_id")
    .notNull()
    .references(() => regions.id),
  assemblyId: uuid("assembly_id")
    .notNull()
    .references(() => assemblies.id),
  skuOverrides: jsonb("sku_overrides"),
});

export const pointElements = pgTable("point_elements", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  geom: jsonb("geom"),
  skuId: uuid("sku_id")
    .notNull()
    .references(() => costItems.id),
  qty: integer("qty").notNull().default(1),
});

export const photos = pgTable("photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  url: text("url").notNull(),
  exif: jsonb("exif"),
  classifications: jsonb("classifications"),
});

export const estimateSnapshots = pgTable("estimate_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  lineItems: jsonb("line_items").notNull(),
  internalTotal: doublePrecision("internal_total").notNull(),
  customerFacingPayload: jsonb("customer_facing_payload").notNull(),
  disclosurePolicyUsed: jsonb("disclosure_policy_used").notNull(),
});

// The training corpus. Do not skip this table.
export const measurementDeltas = pgTable("measurement_deltas", {
  id: uuid("id").primaryKey().defaultRandom(),
  regionId: uuid("region_id")
    .notNull()
    .references(() => regions.id),
  beforeQty: jsonb("before_qty").notNull(),
  afterQty: jsonb("after_qty").notNull(),
  source: text("source").notNull(),
  correctedBy: text("corrected_by").notNull(),
  correctedAt: timestamp("corrected_at", { withTimezone: true }).notNull().defaultNow(),
  jobType: text("job_type"),
});
