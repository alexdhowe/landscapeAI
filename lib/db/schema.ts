/**
 * Data model per project-map section 5, reconciled against what the store
 * actually persists (lib/design/types.ts, lib/lead/types.ts,
 * lib/confirm/types.ts) after phases 5 and 6.
 *
 * Three rules the columns here exist to enforce:
 *
 *   - **Every quantity carries provenance.** Quantity-shaped values live in
 *     JSONB and are stored whole — value, unit, source, confidence,
 *     capturedAt, id, supersedes. There is no bare numeric column standing
 *     in for a measurement anywhere below.
 *   - **Estimates are immutable snapshots.** `customer_facing_payload` is
 *     TEXT, not JSONB. It holds the exact bytes the customer was shown.
 *     JSONB would normalize key order and number formatting on the way
 *     back out, and a re-serialized snapshot is not a snapshot.
 *   - **Geometry is an object graph, never a picture.** Rings and polygons
 *     are GeoJSON-shaped JSONB; images are generated from them.
 *
 * Deviations from section 5's sketch, and why:
 *
 *   - Price-book rows are keyed by their seed identifier ("mulch_hardwood",
 *     "stone_bed_conversion") rather than a surrogate uuid, because those
 *     strings ARE the ids the pure pricing engine resolves components with.
 *     Handing it a uuid would mean translating at the boundary for nothing.
 *   - Region rows are keyed by (project_id, region_id) on the segmentation
 *     region id ("demo_bed") for the same reason: selections and
 *     measurement deltas already reference regions by that id.
 *   - Section 5's `PointElement` has no table yet. Nothing writes one: the
 *     MVP models boulders and plants as assemblies inside a region's
 *     selection, so a point-geometry row would have no author. It returns
 *     with point placement, and a migration adds it then.
 *   - Typology distributions and recipes are org-owned tables. Section 5
 *     does not name them, but section 7 does name them as the contractor's
 *     proprietary data, and an Organization that owns the price book but
 *     imports its bid distributions from a constant is not a tenant.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { PlantMeta } from "../catalog/types";
import type { ConfirmableUnit } from "../confirm/types";
import type { RegionSelection } from "../design/types";
import type { LeadContact } from "../lead/types";
import type { ReconciliationReport } from "../measure/reconcile";
import type {
  DisclosurePolicy,
  LineItem,
  Quantity,
  TierMultiplier,
} from "../pricing/types";
import type { NormalizedPoint, VerticalElement } from "../vision/types";
import type { LngLat } from "../measure/area";

/**
 * Photo bytes. Section 3 puts photos in S3-compatible object storage and
 * section 5's Photo carries a `url`; until that session lands the bytes
 * live here so a database deployment needs no second service. `url` is
 * already present for the row to point outward when it does.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

// ---------------------------------------------------------------------------
// The tenant and everything it owns
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Stable handle a route resolves the tenant by. */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
/**
 * A revision of everything that turns quantities into a price: the price
 * book, the margin config, both disclosure policies, and the bid
 * distributions and recipes behind the opening band.
 *
 * Revisions are the price book's answer to the invariant the rest of the
 * system already lives by. Estimates are immutable snapshots; a snapshot is
 * only interpretable against the prices that produced it; so the prices
 * have to stop changing underneath it. A published revision is frozen —
 * nothing in lib/db/queries.ts updates a row belonging to one.
 *
 * Editing works by copy-on-write:
 *
 *   draft       exactly one per org at a time, freely editable, priced by
 *               nobody. Created by copying the current published revision.
 *   published   immutable, numbered, timestamped, attributed. The current
 *               book is the newest published revision; the book "as of"
 *               a date is the newest one published at or before it.
 *
 * That makes "what did we charge for stone in March" one query, and it
 * makes a delta from March interpretable, because its estimate names the
 * revision it was priced from.
 */
export const priceBookRevisions = pgTable(
  "price_book_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Monotonic per org, assigned when the revision is created. */
    revision: integer("revision").notNull(),
    status: text("status", { enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    /** What this change was, in the contractor's words: "Spring 2026 mulch increase". */
    label: text("label"),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedBy: text("published_by"),
    /** Null while a draft. Point-in-time lookups order by this. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    unique("price_book_revisions_org_revision_key").on(t.orgId, t.revision),
    index("price_book_revisions_published_idx").on(t.orgId, t.publishedAt),
    /**
     * At most one draft per org. Two drafts would be two answers to "what
     * am I editing", and publishing either would silently discard the
     * other. Enforced as a partial unique index — see the migration.
     */
    index("price_book_revisions_status_idx").on(t.orgId, t.status),
  ],
);

export const costItems = pgTable(
  "cost_items",
  {
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => priceBookRevisions.id, { onDelete: "cascade" }),
    /** The id the pricing engine resolves components by, e.g. "mulch_hardwood". */
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    kind: text("kind", {
      enum: ["material", "labor", "equipment", "disposal"],
    }).notNull(),
    unit: text("unit").notNull(),
    unitCost: doublePrecision("unit_cost").notNull(),
    /** Applied to cost (labor burden: taxes, insurance, benefits). */
    burdenPct: doublePrecision("burden_pct"),
    /** Applied to quantity (material overage: cuts, spillage, compaction). */
    wasteFactorPct: doublePrecision("waste_factor_pct"),
    /**
     * Plant metadata for living SKUs, null for hard goods. Captured at seed
     * time because the time slider cannot exist without it and it cannot be
     * backfilled from a bid.
     */
    plantMeta: jsonb("plant_meta").$type<PlantMeta>(),
  },
  (t) => [primaryKey({ columns: [t.revisionId, t.sku] })],
);

export const assemblies = pgTable(
  "assemblies",
  {
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => priceBookRevisions.id, { onDelete: "cascade" }),
    /** The id a selection and a recipe line reference, e.g. "stone_bed_conversion". */
    key: text("key").notNull(),
    name: text("name").notNull(),
    unit: text("unit", { enum: ["SF", "LF", "EA", "CY"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.revisionId, t.key] })],
);

export const assemblyComponents = pgTable(
  "assembly_components",
  {
    revisionId: uuid("revision_id").notNull(),
    assemblyKey: text("assembly_key").notNull(),
    /** Component order within the assembly — line order is part of the bid. */
    position: integer("position").notNull(),
    costItemSku: text("cost_item_sku").notNull(),
    /** Cost-item units per assembly unit. Mutually exclusive with productionRate. */
    qtyPerUnit: doublePrecision("qty_per_unit"),
    /** Assembly units produced per labor/equipment hour. */
    productionRate: doublePrecision("production_rate"),
  },
  (t) => [
    primaryKey({ columns: [t.revisionId, t.assemblyKey, t.position] }),
    index("assembly_components_assembly_idx").on(t.revisionId, t.assemblyKey),
    foreignKey({
      columns: [t.revisionId, t.assemblyKey],
      foreignColumns: [assemblies.revisionId, assemblies.key],
      name: "assembly_components_assembly_fk",
    }).onDelete("cascade"),
    /** The catalog is the guardrail: a component cannot name a SKU you do not stock. */
    foreignKey({
      columns: [t.revisionId, t.costItemSku],
      foreignColumns: [costItems.revisionId, costItems.sku],
      name: "assembly_components_cost_item_fk",
    }).onDelete("restrict"),
  ],
);

/** One per revision — hence revision_id as the primary key. */
export const marginConfigs = pgTable("margin_configs", {
  revisionId: uuid("revision_id")
    .primaryKey()
    .references(() => priceBookRevisions.id, { onDelete: "cascade" }),
  targetGmPct: doublePrecision("target_gm_pct").notNull(),
  minGmPct: doublePrecision("min_gm_pct").notNull(),
  contingencyPct: doublePrecision("contingency_pct").notNull(),
});

/**
 * Both disclosure policies, one row each.
 *
 *   role "band"        the opening/narrowed band a customer browses
 *   role "final_quote" the figure a rep issues after confirming on site
 *
 * `role` is which surface uses the policy; `mode` is what the policy
 * projects to. They are not the same axis: a contractor could disclose the
 * opening price as tiers without touching the quote.
 */
export const disclosurePolicies = pgTable(
  "disclosure_policies",
  {
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => priceBookRevisions.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["band", "final_quote"] }).notNull(),
    mode: text("mode", { enum: ["band", "tiers", "figure"] }).notNull(),
    bandWidthPct: doublePrecision("band_width_pct").notNull(),
    /** Invariant: unit rates never reach a customer surface. */
    showUnitRates: boolean("show_unit_rates").notNull().default(false),
    roundTo: integer("round_to").notNull(),
    tierMultipliers: jsonb("tier_multipliers").$type<TierMultiplier[]>(),
  },
  (t) => [primaryKey({ columns: [t.revisionId, t.role] })],
);

/**
 * P25/P50/P75 of one driving quantity, per job type and market context.
 * Section 7's proprietary table: the reason the first screen can show a
 * credible number before anything is measured.
 */
export const typologyDistributions = pgTable(
  "typology_distributions",
  {
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => priceBookRevisions.id, { onDelete: "cascade" }),
    jobType: text("job_type", {
      enum: ["bed_renovation", "mulch_to_stone", "foundation_planting_refresh"],
    }).notNull(),
    marketContext: text("market_context", {
      enum: ["residential", "hoa_commercial"],
    }).notNull(),
    /** Driving-quantity key a recipe line points at, e.g. "bed_area_sf". */
    distributionKey: text("distribution_key").notNull(),
    unit: text("unit", { enum: ["SF", "LF", "EA", "CY"] }).notNull(),
    p25: doublePrecision("p25").notNull(),
    p50: doublePrecision("p50").notNull(),
    p75: doublePrecision("p75").notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.revisionId, t.jobType, t.marketContext, t.distributionKey],
    }),
  ],
);

/** What a typical job of each type is made of, in bid order. */
export const typologyRecipes = pgTable(
  "typology_recipes",
  {
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => priceBookRevisions.id, { onDelete: "cascade" }),
    jobType: text("job_type", {
      enum: ["bed_renovation", "mulch_to_stone", "foundation_planting_refresh"],
    }).notNull(),
    position: integer("position").notNull(),
    assemblyKey: text("assembly_key").notNull(),
    distributionKey: text("distribution_key").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.revisionId, t.jobType, t.position] }),
    foreignKey({
      columns: [t.revisionId, t.assemblyKey],
      foreignColumns: [assemblies.revisionId, assemblies.key],
      name: "typology_recipes_assembly_fk",
    }).onDelete("restrict"),
  ],
);

/**
 * Contractor staff. Section 5 does not model a user — it models the tenant
 * — but section 3 puts auth on the contractor side, and a login has to
 * belong to someone. Customers stay anonymous: they are a `customerContact`
 * on a project, never a row here.
 *
 * `passwordHash` is scrypt with its parameters and salt encoded inline
 * (lib/auth/password.ts), so the cost can be raised later without a
 * migration and old hashes keep verifying.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Stored lowercased; the login is case-insensitive. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    /**
     * "rep" confirms quantities on site and issues quotes. "admin" also
     * edits the price book — the distinction exists for /pricebook, which
     * is its own session.
     */
    role: text("role", { enum: ["rep", "admin"] }).notNull().default("rep"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [unique("users_email_key").on(t.email)],
);

// ---------------------------------------------------------------------------
// The property and the project on it
// ---------------------------------------------------------------------------

export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** The address as the customer confirmed it (geocoder display name). */
  address: text("address").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  geocodeSource: text("geocode_source", { enum: ["nominatim", "demo"] }).notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  /** Parcel boundary once a parcel source lands (section 3). */
  parcelGeom: jsonb("parcel_geom"),
  imagerySource: text("imagery_source"),
  imageryCapturedAt: timestamp("imagery_captured_at", { withTimezone: true }),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    /** Null until the customer shares an address, and forever if they decline. */
    propertyId: uuid("property_id").references(() => properties.id),
    status: text("status", {
      enum: ["playing", "submitted", "confirmed", "quoted"],
    })
      .notNull()
      .default("playing"),
    marketContext: text("market_context", {
      enum: ["residential", "hoa_commercial"],
    })
      .notNull()
      .default("residential"),
    /** The customer said no to the address ask; design and band survive. */
    addressDeclined: boolean("address_declined").notNull().default(false),
    // --- segmentation envelope; its regions are rows in `regions` ---------
    segmentationStatus: text("segmentation_status", {
      enum: ["pending", "failed", "ready"],
    })
      .notNull()
      .default("pending"),
    segmentationError: text("segmentation_error"),
    /** "claude" for a real vision call, "demo" for the no-API-key fallback. */
    segmentationSource: text("segmentation_source", { enum: ["claude", "demo"] }),
    /** Vertical elements the photo can see and the aerial cannot. */
    verticalElements: jsonb("vertical_elements").$type<VerticalElement[]>(),
    /** What the model reports it cannot determine from this photo. */
    cannotSee: jsonb("cannot_see").$type<string[]>(),
    /** Who to reach about this lead. Set at submit. */
    customerContact: jsonb("customer_contact").$type<LeadContact>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    quotedAt: timestamp("quoted_at", { withTimezone: true }),
  },
  (t) => [
    index("projects_org_created_idx").on(t.orgId, t.createdAt),
    index("projects_submitted_idx").on(t.submittedAt),
  ],
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    mediaType: text("media_type").notNull(),
    /** Interim storage — see the note on `bytea` above. */
    bytes: bytea("bytes").notNull(),
    /** Object-storage URL once photo storage lands. */
    url: text("url"),
    exif: jsonb("exif"),
  },
  (t) => [index("photos_project_idx").on(t.projectId)],
);

/**
 * A segmented region, keyed by the segmentation id the rest of the system
 * already uses. Carries both sensors: the photo's read (kind, label,
 * material, condition, its never-priced footprint estimate) and, once the
 * customer draws on the aerial, the measured ring with its provenance-
 * carrying area and perimeter.
 */
export const regions = pgTable(
  "regions",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Segmentation region id, e.g. "demo_bed". */
    regionId: text("region_id").notNull(),
    /** Order within the segmentation result. */
    position: integer("position").notNull(),
    kind: text("kind", {
      enum: ["turf", "bed", "hardscape", "foundation_planting"],
    }).notNull(),
    label: text("label").notNull(),
    /** Normalized image coordinates, 0-1, origin top-left. */
    polygon: jsonb("polygon").$type<NormalizedPoint[]>().notNull(),
    existingMaterial: text("existing_material"),
    condition: text("condition"),
    /**
     * The photo's rough visible footprint. A reconciliation QA signal ONLY:
     * never priced, never a region's quantity. Aerial wins horizontal area.
     */
    estimatedAreaSf: doublePrecision("estimated_area_sf"),
    confidence: doublePrecision("confidence").notNull(),
    // --- the aerial leg, null until the customer draws it -----------------
    aerialRegionId: uuid("aerial_region_id"),
    /** Open ring in [lng, lat]; first point not repeated. */
    ring: jsonb("ring").$type<LngLat[]>(),
    /** Full Quantity objects — provenance, confidence and lineage included. */
    areaSf: jsonb("area_sf").$type<Quantity>(),
    perimeterLf: jsonb("perimeter_lf").$type<Quantity>(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.regionId] })],
);

/**
 * What the customer put in a region. Section 5 models this as
 * { assemblyId, skuOverrides }; the configurator works in catalog options
 * (lib/catalog/options.ts), each of which resolves to assemblies that exist
 * in the price book — the catalog is the guardrail. The option ids are what
 * is persisted, so they are what this table stores.
 */
export const selections = pgTable(
  "selections",
  {
    projectId: uuid("project_id").notNull(),
    regionId: text("region_id").notNull(),
    surfaceOptionId: text("surface_option_id"),
    addonOptionIds: jsonb("addon_option_ids")
      .$type<RegionSelection["addonOptionIds"]>()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.regionId] }),
    /**
     * Re-segmenting a project replaces its regions; the cascade drops the
     * selections that pointed at regions the new pass did not find. Only
     * reachable while the project is still playing — submit freezes both.
     */
    foreignKey({
      columns: [t.projectId, t.regionId],
      foreignColumns: [regions.projectId, regions.regionId],
      name: "selections_region_fk",
    }).onDelete("cascade"),
  ],
);

// ---------------------------------------------------------------------------
// The frozen record
// ---------------------------------------------------------------------------

/**
 * An immutable estimate snapshot. Append-only by contract: nothing in
 * lib/db/queries.ts updates or deletes a row here.
 *
 * Both sides of the disclosure boundary live in one row. `line_items`,
 * `internal_total` and `reconciliation` are INTERNAL and reach contractor
 * surfaces only; `customer_facing_payload` is the customer's bytes.
 */
export const estimateSnapshots = pgTable(
  "estimate_snapshots",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Insertion order — the append-only list reads back in it. */
    seq: serial("seq").notNull(),
    /**
     * Which side of the confirmation gate this record sits on:
     * what the customer sent, or the quote the rep issued after the visit.
     */
    kind: text("kind", { enum: ["customer_submitted", "rep_confirmed"] }).notNull(),
    /** What the frozen figure was derived from. */
    basis: text("basis", { enum: ["typology", "measured", "rep_confirmed"] }).notNull(),
    jobType: text("job_type", {
      enum: ["bed_renovation", "mulch_to_stone", "foundation_planting_refresh"],
    }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    /** Frozen line items, provenance-carrying quantities included. INTERNAL. */
    lineItems: jsonb("line_items").$type<LineItem[]>().notNull(),
    /** The engine's sell price at freeze time. INTERNAL. */
    internalTotal: doublePrecision("internal_total").notNull(),
    /**
     * TEXT, deliberately. The exact serialized bytes the customer saw. A
     * JSONB round trip would re-serialize them and the snapshot would stop
     * being one.
     */
    customerFacingPayload: text("customer_facing_payload").notNull(),
    disclosurePolicyUsed: jsonb("disclosure_policy_used")
      .$type<DisclosurePolicy>()
      .notNull(),
    /** Frozen photo/aerial arbitration; null when only one sensor reported. INTERNAL. */
    reconciliation: jsonb("reconciliation").$type<ReconciliationReport>(),
    /**
     * The price book revision this was priced from.
     *
     * The line items above are already frozen, so this is not how the
     * numbers are recovered — it is how they are EXPLAINED. A delta saying
     * an estimate missed by 15% is only interpretable against the prices
     * that produced it, and this is the pointer that says which those were.
     * Null on snapshots frozen before revisions existed.
     */
    priceBookRevisionId: uuid("price_book_revision_id").references(
      () => priceBookRevisions.id,
    ),
  },
  (t) => [
    index("estimate_snapshots_project_idx").on(t.projectId, t.seq),
    unique("estimate_snapshots_project_kind_key").on(t.projectId, t.kind),
  ],
);

/**
 * The training corpus. Do not skip this table.
 *
 * One row per on-site correction: the estimate that was wrong, the
 * confirmed truth that replaced it, and the provenance of each. Both
 * quantities are stored whole, because the corpus's independent variable is
 * `before_qty->>'source'` — how wrong is each way of estimating.
 *
 * Append-only, and indexed for the query section 6 calls the whole
 * business: mean and P90 error by job type across every delta.
 */
export const measurementDeltas = pgTable(
  "measurement_deltas",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Insertion order, so corrections made in the same millisecond keep theirs. */
    seq: serial("seq").notNull(),
    /**
     * The segmentation region corrected. Deliberately NOT a foreign key:
     * a delta is self-contained on purpose (lib/confirm/types.ts) — it must
     * outlive a re-segmentation that renames or drops the region, because
     * the estimate it corrected is gone the moment it is corrected.
     */
    regionId: text("region_id").notNull(),
    /** Region label at correction time, for the same reason. */
    regionLabel: text("region_label").notNull(),
    jobType: text("job_type", {
      enum: ["bed_renovation", "mulch_to_stone", "foundation_planting_refresh"],
    }).notNull(),
    marketContext: text("market_context", {
      enum: ["residential", "hoa_commercial"],
    }).notNull(),
    /** Area or edge run. Counts stay typology-scaled for the MVP. */
    unit: text("unit", { enum: ["SF", "LF"] }).$type<ConfirmableUnit>().notNull(),
    /** The superseded estimate, with the provenance that produced it. */
    beforeQty: jsonb("before_qty").$type<Quantity>().notNull(),
    /** The confirmed truth: source 'rep_confirmed', supersedes beforeQty.id. */
    afterQty: jsonb("after_qty").$type<Quantity>().notNull(),
    /** Provenance of the correction itself — always 'rep_confirmed' here. */
    source: text("source").$type<Quantity["source"]>().notNull(),
    correctedBy: text("corrected_by").notNull(),
    correctedAt: timestamp("corrected_at", { withTimezone: true }).notNull(),
    note: text("note"),
  },
  (t) => [
    /** listMeasurementDeltas: the whole corpus, oldest first, one index scan. */
    index("measurement_deltas_corrected_at_idx").on(t.correctedAt, t.seq),
    index("measurement_deltas_project_idx").on(t.projectId, t.correctedAt, t.seq),
    /** The section 6 query groups on this. */
    index("measurement_deltas_job_type_idx").on(t.jobType),
  ],
);

// ---------------------------------------------------------------------------
// Relations — for typed `with` reads in queries.ts
// ---------------------------------------------------------------------------

export const projectRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.orgId],
    references: [organizations.id],
  }),
  property: one(properties, {
    fields: [projects.propertyId],
    references: [properties.id],
  }),
  photos: many(photos),
  regions: many(regions),
  selections: many(selections),
  snapshots: many(estimateSnapshots),
  deltas: many(measurementDeltas),
}));

export const userRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
}));

export const regionRelations = relations(regions, ({ one }) => ({
  project: one(projects, {
    fields: [regions.projectId],
    references: [projects.id],
  }),
}));

export const selectionRelations = relations(selections, ({ one }) => ({
  project: one(projects, {
    fields: [selections.projectId],
    references: [projects.id],
  }),
}));

export const photoRelations = relations(photos, ({ one }) => ({
  project: one(projects, { fields: [photos.projectId], references: [projects.id] }),
}));

export const snapshotRelations = relations(estimateSnapshots, ({ one }) => ({
  project: one(projects, {
    fields: [estimateSnapshots.projectId],
    references: [projects.id],
  }),
  priceBookRevision: one(priceBookRevisions, {
    fields: [estimateSnapshots.priceBookRevisionId],
    references: [priceBookRevisions.id],
  }),
}));

export const priceBookRevisionRelations = relations(
  priceBookRevisions,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [priceBookRevisions.orgId],
      references: [organizations.id],
    }),
    costItems: many(costItems),
    assemblies: many(assemblies),
  }),
);

export const deltaRelations = relations(measurementDeltas, ({ one }) => ({
  project: one(projects, {
    fields: [measurementDeltas.projectId],
    references: [projects.id],
  }),
}));
