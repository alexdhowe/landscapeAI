import { NextResponse } from "next/server";

import { bandForSelections } from "@/lib/design/band";
import {
  measuredBandForSelections,
  type RegionMeasurement,
} from "@/lib/design/measured";
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
    for (const region of project.aerialRegions ?? []) {
      measurements[region.photoRegionId] = {
        areaSf: region.areaSf,
        perimeterLf: region.perimeterLf,
      };
    }
    const measured = measuredBandForSelections(
      project.selections,
      measurements,
      project.marketContext,
      wiTypologyConfig,
      wiBandPolicy,
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
