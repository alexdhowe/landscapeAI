/**
 * Every query the application runs, and the only place rows become domain
 * objects (project-map section 4). lib/store calls in here; nothing else
 * does, and nothing above lib/store knows a database exists.
 *
 * Two things this module is careful about:
 *
 *   - Quantities go in and come out whole. `area_sf`, `perimeter_lf`,
 *     `before_qty` and `after_qty` are JSONB and are read back as the
 *     Quantity objects they were written as — value, unit, source,
 *     confidence, capturedAt, id, supersedes.
 *   - A frozen snapshot's customer bytes are never parsed and re-emitted.
 *     They are read out of a TEXT column exactly as stored.
 *
 * Server-only.
 */
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

import type { ErrorStats } from "../confirm/analytics";
import type { MeasurementDelta } from "../confirm/types";
import type {
  AerialRegion,
  DesignProject,
  ProjectLocation,
  RegionSelection,
  SegmentationState,
} from "../design/types";
import type { EstimateSnapshot, LeadContact } from "../lead/types";
import type { JobType, MarketContext, TypologyConfig } from "../pricing/typology";
import type {
  Assembly,
  AssemblyComponent,
  CostItem,
  DisclosurePolicy,
  MarginConfig,
  PriceBook,
} from "../pricing/types";
import type { SegmentedRegion } from "../vision/types";

import type { Database } from "./client";
import {
  assemblies,
  assemblyComponents,
  costItems,
  disclosurePolicies,
  estimateSnapshots,
  marginConfigs,
  measurementDeltas,
  organizations,
  photos,
  projects,
  properties,
  regions,
  selections,
  typologyDistributions,
  typologyRecipes,
} from "./schema";

// ---------------------------------------------------------------------------
// Row → domain
// ---------------------------------------------------------------------------

const iso = (value: Date): string => value.toISOString();

type ProjectRow = typeof projects.$inferSelect;
type RegionRow = typeof regions.$inferSelect;
type SelectionRow = typeof selections.$inferSelect;
type SnapshotRow = typeof estimateSnapshots.$inferSelect;
type DeltaRow = typeof measurementDeltas.$inferSelect;
type PropertyRow = typeof properties.$inferSelect;

type ProjectBundle = ProjectRow & {
  property: PropertyRow | null;
  photos: { fileName: string; mediaType: string }[];
  regions: RegionRow[];
  selections: SelectionRow[];
  snapshots: SnapshotRow[];
  deltas: DeltaRow[];
};

function toSegmentedRegion(row: RegionRow): SegmentedRegion {
  return {
    id: row.regionId,
    kind: row.kind,
    label: row.label,
    polygon: row.polygon,
    ...(row.existingMaterial === null ? {} : { existingMaterial: row.existingMaterial }),
    ...(row.condition === null ? {} : { condition: row.condition }),
    ...(row.estimatedAreaSf === null ? {} : { estimatedAreaSf: row.estimatedAreaSf }),
    confidence: row.confidence,
  };
}

function toSegmentation(row: ProjectBundle): SegmentationState {
  if (row.segmentationStatus === "pending") return { status: "pending" };
  if (row.segmentationStatus === "failed") {
    return { status: "failed", error: row.segmentationError ?? "" };
  }
  return {
    status: "ready",
    regions: row.regions.map(toSegmentedRegion),
    verticalElements: row.verticalElements ?? [],
    cannotSee: row.cannotSee ?? [],
    source: row.segmentationSource ?? "demo",
  };
}

function toLocation(row: PropertyRow): ProjectLocation {
  return {
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    source: row.geocodeSource,
    capturedAt: iso(row.capturedAt),
  };
}

/** Only regions the customer actually drew on the aerial carry a measurement. */
function toAerialRegion(row: RegionRow): AerialRegion | null {
  if (!row.aerialRegionId || !row.ring || !row.areaSf || !row.perimeterLf) return null;
  return {
    id: row.aerialRegionId,
    photoRegionId: row.regionId,
    ring: row.ring,
    areaSf: row.areaSf,
    perimeterLf: row.perimeterLf,
  };
}

function toSelection(row: SelectionRow): RegionSelection {
  return {
    ...(row.surfaceOptionId === null ? {} : { surfaceOptionId: row.surfaceOptionId }),
    addonOptionIds: row.addonOptionIds,
  };
}

function toSnapshot(row: SnapshotRow): EstimateSnapshot {
  return {
    id: row.id,
    projectId: row.projectId,
    issuedAt: iso(row.issuedAt),
    kind: row.kind,
    basis: row.basis,
    jobType: row.jobType,
    lineItems: row.lineItems,
    internalTotal: row.internalTotal,
    // Straight out of the TEXT column. Never JSON.parse'd, never re-emitted.
    customerFacingPayload: row.customerFacingPayload,
    disclosurePolicyUsed: row.disclosurePolicyUsed,
    reconciliation: row.reconciliation ?? null,
  };
}

function toDelta(row: DeltaRow): MeasurementDelta {
  return {
    id: row.id,
    projectId: row.projectId,
    regionId: row.regionId,
    regionLabel: row.regionLabel,
    jobType: row.jobType,
    marketContext: row.marketContext,
    unit: row.unit,
    beforeQty: row.beforeQty,
    afterQty: row.afterQty,
    source: row.source,
    correctedBy: row.correctedBy,
    correctedAt: iso(row.correctedAt),
    ...(row.note === null ? {} : { note: row.note }),
  };
}

/**
 * The whole design, assembled. Optional members are omitted rather than
 * emitted empty, so a DB-backed project reads exactly like a file-backed
 * one: "no deltas yet" is an absent key on both.
 */
export function toDesignProject(row: ProjectBundle): DesignProject {
  const photo = row.photos[0];
  const aerialRegions = row.regions
    .map(toAerialRegion)
    .filter((r): r is AerialRegion => r !== null);

  const project: DesignProject = {
    id: row.id,
    createdAt: iso(row.createdAt),
    status: row.status,
    photo: {
      fileName: photo?.fileName ?? "photo",
      mediaType: photo?.mediaType ?? "application/octet-stream",
    },
    segmentation: toSegmentation(row),
    selections: Object.fromEntries(
      row.selections.map((s) => [s.regionId, toSelection(s)]),
    ),
    marketContext: row.marketContext,
  };

  if (row.property) project.location = toLocation(row.property);
  if (row.addressDeclined) project.addressDeclined = true;
  if (aerialRegions.length > 0) project.aerialRegions = aerialRegions;
  if (row.customerContact) project.contact = row.customerContact;
  if (row.submittedAt) project.submittedAt = iso(row.submittedAt);
  if (row.snapshots.length > 0) project.snapshots = row.snapshots.map(toSnapshot);
  if (row.deltas.length > 0) project.deltas = row.deltas.map(toDelta);
  if (row.quotedAt) project.quotedAt = iso(row.quotedAt);

  return project;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Everything a DesignProject needs, in one round trip. Photo BYTES excluded. */
const projectWith = {
  property: true as const,
  photos: { columns: { fileName: true as const, mediaType: true as const } },
  regions: { orderBy: [asc(regions.position)] },
  selections: { orderBy: [asc(selections.regionId)] },
  snapshots: { orderBy: [asc(estimateSnapshots.seq)] },
  deltas: { orderBy: [asc(measurementDeltas.correctedAt), asc(measurementDeltas.seq)] },
};

export async function findProject(
  db: Database,
  id: string,
): Promise<DesignProject | null> {
  const row = await db.query.projects.findFirst({
    where: eq(projects.id, id),
    with: projectWith,
  });
  return row ? toDesignProject(row as ProjectBundle) : null;
}

export async function findProjectPhoto(
  db: Database,
  id: string,
): Promise<{ bytes: Buffer; mediaType: string } | null> {
  const row = await db.query.photos.findFirst({ where: eq(photos.projectId, id) });
  if (!row) return null;
  return { bytes: Buffer.from(row.bytes), mediaType: row.mediaType };
}

/** Every project, newest first. */
export async function listProjectRows(db: Database): Promise<DesignProject[]> {
  const rows = await db.query.projects.findMany({
    with: projectWith,
    orderBy: [sql`${projects.createdAt} desc`],
  });
  return rows.map((row) => toDesignProject(row as ProjectBundle));
}

/** Submitted leads for the contractor inbox, newest submission first. */
export async function listLeadRows(db: Database): Promise<DesignProject[]> {
  const rows = await db.query.projects.findMany({
    where: isNotNull(projects.submittedAt),
    with: projectWith,
    orderBy: [sql`${projects.submittedAt} desc`],
  });
  return rows.map((row) => toDesignProject(row as ProjectBundle));
}

/**
 * The training corpus, oldest first — one index scan over
 * measurement_deltas, not a walk over every project on disk.
 */
export async function listDeltas(db: Database): Promise<MeasurementDelta[]> {
  const rows = await db
    .select()
    .from(measurementDeltas)
    .orderBy(asc(measurementDeltas.correctedAt), asc(measurementDeltas.seq));
  return rows.map(toDelta);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type NewProject = {
  id: string;
  orgId: string;
  createdAt: string;
  photo: { fileName: string; mediaType: string; bytes: Buffer };
};

export async function insertProject(db: Database, input: NewProject): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(projects).values({
      id: input.id,
      orgId: input.orgId,
      createdAt: new Date(input.createdAt),
    });
    await tx.insert(photos).values({
      projectId: input.id,
      fileName: input.photo.fileName,
      mediaType: input.photo.mediaType,
      bytes: input.photo.bytes,
    });
  });
}

/**
 * Replace the segmentation. Regions are rewritten wholesale because a new
 * pass is a new answer, not an edit of the old one; the cascade on
 * `selections` drops choices made against regions this pass did not find.
 */
export async function replaceSegmentation(
  db: Database,
  projectId: string,
  segmentation: SegmentationState,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({
        segmentationStatus: segmentation.status,
        segmentationError: segmentation.status === "failed" ? segmentation.error : null,
        segmentationSource:
          segmentation.status === "ready" ? segmentation.source : null,
        verticalElements:
          segmentation.status === "ready" ? segmentation.verticalElements : null,
        cannotSee: segmentation.status === "ready" ? segmentation.cannotSee : null,
      })
      .where(eq(projects.id, projectId));

    await tx.delete(regions).where(eq(regions.projectId, projectId));
    if (segmentation.status !== "ready" || segmentation.regions.length === 0) return;

    await tx.insert(regions).values(
      segmentation.regions.map((region, position) => ({
        projectId,
        regionId: region.id,
        position,
        kind: region.kind,
        label: region.label,
        polygon: region.polygon,
        existingMaterial: region.existingMaterial ?? null,
        condition: region.condition ?? null,
        estimatedAreaSf: region.estimatedAreaSf ?? null,
        confidence: region.confidence,
      })),
    );
  });
}

export async function upsertSelection(
  db: Database,
  projectId: string,
  regionId: string,
  selection: RegionSelection,
): Promise<void> {
  await db
    .insert(selections)
    .values({
      projectId,
      regionId,
      surfaceOptionId: selection.surfaceOptionId ?? null,
      addonOptionIds: selection.addonOptionIds,
    })
    .onConflictDoUpdate({
      target: [selections.projectId, selections.regionId],
      set: {
        surfaceOptionId: selection.surfaceOptionId ?? null,
        addonOptionIds: selection.addonOptionIds,
      },
    });
}

/** Sharing an address supersedes any earlier decline. */
export async function setProjectLocation(
  db: Database,
  projectId: string,
  location: ProjectLocation,
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: { propertyId: true },
    });
    const values = {
      address: location.address,
      lat: location.lat,
      lng: location.lng,
      geocodeSource: location.source,
      capturedAt: new Date(location.capturedAt),
    };
    // Re-confirming an address moves the same property rather than
    // stranding the old row: one project, one property.
    let propertyId = existing?.propertyId ?? null;
    if (propertyId) {
      await tx.update(properties).set(values).where(eq(properties.id, propertyId));
    } else {
      const [inserted] = await tx
        .insert(properties)
        .values(values)
        .returning({ id: properties.id });
      propertyId = inserted.id;
    }
    await tx
      .update(projects)
      .set({ propertyId, addressDeclined: false })
      .where(eq(projects.id, projectId));
  });
}

export async function setAddressDeclined(
  db: Database,
  projectId: string,
): Promise<void> {
  await db
    .update(projects)
    .set({ addressDeclined: true })
    .where(eq(projects.id, projectId));
}

/** One aerial polygon per photo region: re-drawing replaces the old one. */
export async function setRegionMeasurement(
  db: Database,
  projectId: string,
  region: AerialRegion,
): Promise<void> {
  await db
    .update(regions)
    .set({
      aerialRegionId: region.id,
      ring: region.ring,
      areaSf: region.areaSf,
      perimeterLf: region.perimeterLf,
    })
    .where(
      and(eq(regions.projectId, projectId), eq(regions.regionId, region.photoRegionId)),
    );
}

export async function clearRegionMeasurement(
  db: Database,
  projectId: string,
  photoRegionId: string,
): Promise<void> {
  await db
    .update(regions)
    .set({ aerialRegionId: null, ring: null, areaSf: null, perimeterLf: null })
    .where(and(eq(regions.projectId, projectId), eq(regions.regionId, photoRegionId)));
}

export async function setMarketContext(
  db: Database,
  projectId: string,
  marketContext: MarketContext,
): Promise<void> {
  await db.update(projects).set({ marketContext }).where(eq(projects.id, projectId));
}

/**
 * Freeze the customer's estimate and lock the project.
 *
 * The snapshot insert is the only way a row reaches estimate_snapshots, and
 * no query in this module ever updates or deletes one.
 */
export async function insertSubmission(
  db: Database,
  projectId: string,
  contact: LeadContact,
  snapshot: EstimateSnapshot,
): Promise<void> {
  await db.transaction(async (tx) => {
    await insertSnapshotRow(tx as unknown as Database, snapshot, "customer_submitted");
    await tx
      .update(projects)
      .set({
        status: "submitted",
        customerContact: contact,
        submittedAt: new Date(snapshot.issuedAt),
      })
      .where(eq(projects.id, projectId));
  });
}

async function insertSnapshotRow(
  db: Database,
  snapshot: EstimateSnapshot,
  kind: "customer_submitted" | "rep_confirmed",
): Promise<void> {
  await db.insert(estimateSnapshots).values({
    id: snapshot.id,
    projectId: snapshot.projectId,
    kind: snapshot.kind ?? kind,
    basis: snapshot.basis,
    jobType: snapshot.jobType,
    issuedAt: new Date(snapshot.issuedAt),
    lineItems: snapshot.lineItems,
    internalTotal: snapshot.internalTotal,
    customerFacingPayload: snapshot.customerFacingPayload,
    disclosurePolicyUsed: snapshot.disclosurePolicyUsed,
    reconciliation: snapshot.reconciliation,
  });
}

/** Append the rep's corrections. Nothing here touches the frozen snapshot. */
export async function insertDeltas(
  db: Database,
  projectId: string,
  deltas: MeasurementDelta[],
): Promise<void> {
  await db.transaction(async (tx) => {
    if (deltas.length > 0) {
      await tx.insert(measurementDeltas).values(
        deltas.map((delta) => ({
          id: delta.id,
          projectId: delta.projectId,
          regionId: delta.regionId,
          regionLabel: delta.regionLabel,
          jobType: delta.jobType,
          marketContext: delta.marketContext,
          unit: delta.unit,
          beforeQty: delta.beforeQty,
          afterQty: delta.afterQty,
          source: delta.source,
          correctedBy: delta.correctedBy,
          correctedAt: new Date(delta.correctedAt),
          note: delta.note ?? null,
        })),
      );
    }
    await tx
      .update(projects)
      .set({ status: "confirmed" })
      .where(eq(projects.id, projectId));
  });
}

/** Issue the final quote: a NEW snapshot beside the customer's original. */
export async function insertFinalQuote(
  db: Database,
  projectId: string,
  snapshot: EstimateSnapshot,
): Promise<void> {
  await db.transaction(async (tx) => {
    await insertSnapshotRow(tx as unknown as Database, snapshot, "rep_confirmed");
    await tx
      .update(projects)
      .set({ status: "quoted", quotedAt: new Date(snapshot.issuedAt) })
      .where(eq(projects.id, projectId));
  });
}

// ---------------------------------------------------------------------------
// The corpus query (project-map section 6)
// ---------------------------------------------------------------------------

/**
 * Mean and P90 estimation error by job type, as one SQL statement.
 *
 * The same numbers lib/confirm/analytics.ts computes in memory and /deltas
 * renders — error is `(estimate - truth) / truth`, read out of the JSONB
 * quantities so the provenance stays attached to the row it came from.
 *
 * `percentile_disc` is nearest-rank, matching the analytics module's
 * deliberate refusal to interpolate: with the sample sizes a contractor
 * actually has, a P90 halfway between two observations is precision that
 * isn't there.
 */
export async function deltaErrorStatsByJobType(
  db: Database,
): Promise<Partial<Record<JobType, ErrorStats>>> {
  const result = await db.execute(sql`
    with errors as (
      select
        job_type,
        case
          when (after_qty ->> 'value')::double precision = 0 then 0
          else ((before_qty ->> 'value')::double precision
                - (after_qty ->> 'value')::double precision)
               / (after_qty ->> 'value')::double precision * 100
        end as error_pct
      from measurement_deltas
    )
    select
      job_type,
      count(*) as count,
      round(avg(error_pct)::numeric, 1) as mean_error_pct,
      round(avg(abs(error_pct))::numeric, 1) as mean_abs_error_pct,
      round((percentile_disc(0.5) within group (order by abs(error_pct)))::numeric, 1)
        as median_abs_error_pct,
      round((percentile_disc(0.9) within group (order by abs(error_pct)))::numeric, 1)
        as p90_abs_error_pct,
      round(max(abs(error_pct))::numeric, 1) as max_abs_error_pct
    from errors
    group by job_type
    order by job_type
  `);

  // postgres.js hands back an array of rows; PGlite wraps them in { rows }.
  const raw = result as unknown as
    | Record<string, unknown>[]
    | { rows: Record<string, unknown>[] };
  const rows = Array.isArray(raw) ? raw : raw.rows;
  const out: Partial<Record<JobType, ErrorStats>> = {};
  for (const row of rows) {
    out[row.job_type as JobType] = {
      count: Number(row.count),
      meanErrorPct: Number(row.mean_error_pct),
      meanAbsErrorPct: Number(row.mean_abs_error_pct),
      medianAbsErrorPct: Number(row.median_abs_error_pct),
      p90AbsErrorPct: Number(row.p90_abs_error_pct),
      maxAbsErrorPct: Number(row.max_abs_error_pct),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// The tenant (project-map section 5: the contractor org owns the price book)
// ---------------------------------------------------------------------------

/**
 * Everything a route needs to price for one contractor. Assembled from the
 * org's own rows — the price book, its margin config, both disclosure
 * policies, and the bid distributions behind the opening band.
 */
export type OrgPricing = {
  id: string;
  slug: string;
  name: string;
  priceBook: PriceBook;
  margin: MarginConfig;
  bandPolicy: DisclosurePolicy;
  finalQuotePolicy: DisclosurePolicy;
  typology: TypologyConfig;
};

export class OrganizationNotFoundError extends Error {
  constructor(slug: string) {
    super(
      `No organization "${slug}" in the database — run \`npm run db:seed\` to load the price book`,
    );
    this.name = "OrganizationNotFoundError";
  }
}

const emptyDistributions = (): TypologyConfig["distributions"] => ({
  bed_renovation: { residential: {}, hoa_commercial: {} },
  mulch_to_stone: { residential: {}, hoa_commercial: {} },
  foundation_planting_refresh: { residential: {}, hoa_commercial: {} },
});

const emptyRecipes = (): TypologyConfig["recipes"] => ({
  bed_renovation: [],
  mulch_to_stone: [],
  foundation_planting_refresh: [],
});

/** The org and its price book, in one read. */
export async function loadOrganization(
  db: Database,
  slug: string,
): Promise<OrgPricing> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.slug, slug),
  });
  if (!org) throw new OrganizationNotFoundError(slug);

  const [
    costItemRows,
    assemblyRows,
    componentRows,
    marginRow,
    policyRows,
    distributionRows,
    recipeRows,
  ] = await Promise.all([
    db.select().from(costItems).where(eq(costItems.orgId, org.id)).orderBy(asc(costItems.sku)),
    db.select().from(assemblies).where(eq(assemblies.orgId, org.id)).orderBy(asc(assemblies.key)),
    db
      .select()
      .from(assemblyComponents)
      .where(eq(assemblyComponents.orgId, org.id))
      .orderBy(asc(assemblyComponents.assemblyKey), asc(assemblyComponents.position)),
    db.query.marginConfigs.findFirst({ where: eq(marginConfigs.orgId, org.id) }),
    db.select().from(disclosurePolicies).where(eq(disclosurePolicies.orgId, org.id)),
    db
      .select()
      .from(typologyDistributions)
      .where(eq(typologyDistributions.orgId, org.id)),
    db
      .select()
      .from(typologyRecipes)
      .where(eq(typologyRecipes.orgId, org.id))
      .orderBy(asc(typologyRecipes.jobType), asc(typologyRecipes.position)),
  ]);

  if (!marginRow) throw new OrganizationNotFoundError(slug);

  const componentsByAssembly = new Map<string, AssemblyComponent[]>();
  for (const row of componentRows) {
    const list = componentsByAssembly.get(row.assemblyKey) ?? [];
    list.push({
      costItemId: row.costItemSku,
      ...(row.qtyPerUnit === null ? {} : { qtyPerUnit: row.qtyPerUnit }),
      ...(row.productionRate === null ? {} : { productionRate: row.productionRate }),
    });
    componentsByAssembly.set(row.assemblyKey, list);
  }

  const priceBook: PriceBook = {
    costItems: costItemRows.map((row) => ({
      id: row.sku,
      name: row.name,
      kind: row.kind,
      unit: row.unit as CostItem["unit"],
      unitCost: row.unitCost,
      ...(row.burdenPct === null ? {} : { burdenPct: row.burdenPct }),
      ...(row.wasteFactorPct === null ? {} : { wasteFactorPct: row.wasteFactorPct }),
    })),
    assemblies: assemblyRows.map((row) => ({
      id: row.key,
      name: row.name,
      unit: row.unit,
      components: componentsByAssembly.get(row.key) ?? [],
    })),
  };

  const policy = (role: "band" | "final_quote"): DisclosurePolicy => {
    const row = policyRows.find((p) => p.role === role);
    if (!row) throw new OrganizationNotFoundError(slug);
    return {
      mode: row.mode,
      bandWidthPct: row.bandWidthPct,
      // Typed `false` in the domain: unit rates never reach a customer.
      showUnitRates: false,
      roundTo: row.roundTo,
      ...(row.tierMultipliers === null ? {} : { tierMultipliers: row.tierMultipliers }),
    };
  };

  const distributions = emptyDistributions();
  for (const row of distributionRows) {
    distributions[row.jobType][row.marketContext][row.distributionKey] = {
      unit: row.unit,
      p25: row.p25,
      p50: row.p50,
      p75: row.p75,
    };
  }

  const recipes = emptyRecipes();
  for (const row of recipeRows) {
    recipes[row.jobType].push({
      assemblyId: row.assemblyKey,
      distributionKey: row.distributionKey,
    });
  }

  const margin: MarginConfig = {
    targetGmPct: marginRow.targetGmPct,
    minGmPct: marginRow.minGmPct,
    contingencyPct: marginRow.contingencyPct,
  };
  const bandPolicy = policy("band");

  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    priceBook,
    margin,
    bandPolicy,
    finalQuotePolicy: policy("final_quote"),
    typology: {
      priceBook,
      margin,
      // The band's display increment is the band policy's — one setting,
      // not two that can disagree on the same screen.
      roundTo: bandPolicy.roundTo,
      recipes,
      distributions,
    },
  };
}
