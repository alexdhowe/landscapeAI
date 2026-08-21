import { NextResponse } from "next/server";

import { bandForSelections } from "@/lib/design/band";
import {
  measuredBandForSelections,
  type RegionMeasurement,
} from "@/lib/design/measured";
import {
  reconcileDesign,
  type ReconciliationReport,
} from "@/lib/measure/reconcile";
import type { Quantity } from "@/lib/pricing/types";
import { ProjectNotFoundError, getProject } from "@/lib/store/projects";
import { wiBandPolicy, wiTypologyConfig } from "@/seed/pricebook.seed";

/**
 * POST { projectId } → the customer-facing band for the current design.
 *
 * Basis "typology" until at least one selected region has been measured on
 * the aerial; then basis "measured": the Phase 1 engine run on the drawn
 * quantities, projected through the disclosure policy. The typology band
 * rides along so the UI can show the range visibly narrowing.
 *
 * Phase 4: once both sensors have reported — photo segmentation and aerial
 * measurements — they are reconciled. Agreement tightens the disclosure
 * band; disagreement (e.g. a photo paired with the wrong address) widens
 * it and flags the design for review. The response carries a customer-safe
 * summary of that arbitration.
 *
 * The pricing engine runs only here, server-side. The response is the
 * customer-facing projection — never line items, unit rates, costs, or
 * margin.
 */
export async function POST(request: Request) {
  let body: { projectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.projectId !== "string") {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  try {
    const project = await getProject(body.projectId);
    const typology = bandForSelections(
      project.selections,
      project.marketContext,
      wiTypologyConfig,
    );
    if (!typology) {
      return NextResponse.json({ band: null });
    }

    const measurements: Record<string, RegionMeasurement> = {};
    const aerialAreaByRegionId: Record<string, Quantity> = {};
    for (const region of project.aerialRegions ?? []) {
      measurements[region.photoRegionId] = {
        areaSf: region.areaSf,
        perimeterLf: region.perimeterLf,
      };
      aerialAreaByRegionId[region.photoRegionId] = region.areaSf;
    }

    // Both sensors present → arbitrate. (Projects segmented before Phase 4
    // have no verticalElements field; treat that as none reported.)
    let reconciliation: ReconciliationReport | null = null;
    if (
      project.segmentation.status === "ready" &&
      Object.keys(aerialAreaByRegionId).length > 0
    ) {
      reconciliation = reconcileDesign(
        {
          regions: project.segmentation.regions,
          verticalElements: project.segmentation.verticalElements ?? [],
          cannotSee: project.segmentation.cannotSee,
        },
        aerialAreaByRegionId,
      );
    }

    const policy = reconciliation
      ? {
          ...wiBandPolicy,
          bandWidthPct: wiBandPolicy.bandWidthPct * reconciliation.bandWidthFactor,
        }
      : wiBandPolicy;

    const measured = measuredBandForSelections(
      project.selections,
      measurements,
      project.marketContext,
      wiTypologyConfig,
      policy,
    );

    if (measured) {
      return NextResponse.json({
        band: {
          low: measured.low,
          high: measured.high,
          currency: measured.currency,
          basis: measured.basis,
        },
        typologyBand: { low: typology.band.low, high: typology.band.high },
        jobType: measured.jobType,
        context: project.marketContext,
        scope: measured.scope,
        measurement: {
          measuredRegions: measured.measuredRegionIds.length,
          unmeasuredRegions: measured.unmeasuredRegionIds.length,
          totalAreaSf: measured.totalMeasuredAreaSf,
        },
        // Customer-safe arbitration summary: verdicts and photo scope notes
        // only — no internal pricing data.
        reconciliation: reconciliation
          ? {
              outcome: reconciliation.outcome,
              flagged: reconciliation.flagged,
              comparedRegions: reconciliation.comparedRegionIds.length,
              flaggedRegions: reconciliation.regions
                .filter((r) => r.verdict === "disagreement")
                .map((r) => ({ id: r.photoRegionId, label: r.label })),
              verticalElements: reconciliation.verticalElements.map((v) => ({
                kind: v.kind,
                description: v.description,
              })),
            }
          : null,
      });
    }

    return NextResponse.json({
      band: {
        low: typology.band.low,
        high: typology.band.high,
        typical: typology.band.typical,
        currency: typology.band.currency,
        basis: typology.band.basis,
      },
      jobType: typology.jobType,
      context: project.marketContext,
      scope: typology.scope,
    });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    throw error;
  }
}
