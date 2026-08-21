import { NextResponse } from "next/server";

import { requireContractor } from "@/lib/auth/guard";
import { InvalidCorrectionError, recordCorrection } from "@/lib/confirm/deltas";
import { currentRegionQuantities, regionLabels } from "@/lib/confirm/quantities";
import {
  CONFIRMABLE_UNITS,
  type Correction,
  type MeasurementDelta,
} from "@/lib/confirm/types";
import type { Quantity } from "@/lib/pricing/types";
import { inferJobType } from "@/lib/design/band";
import { resolveOrg } from "@/lib/org/resolve";
import {
  ProjectNotFoundError,
  ProjectStageError,
  appendDeltas,
  getProject,
} from "@/lib/store/projects";

type Params = { params: Promise<{ projectId: string }> };

const MAX_CORRECTIONS = 50;

function parseCorrections(raw: unknown): Correction[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_CORRECTIONS) {
    return null;
  }
  const corrections: Correction[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") return null;
    const c = entry as Record<string, unknown>;
    if (typeof c.photoRegionId !== "string" || c.photoRegionId.length === 0) return null;
    if (
      typeof c.unit !== "string" ||
      !CONFIRMABLE_UNITS.includes(c.unit as Correction["unit"])
    ) {
      return null;
    }
    if (typeof c.value !== "number" || !Number.isFinite(c.value) || c.value <= 0) {
      return null;
    }
    if (c.note !== undefined && (typeof c.note !== "string" || c.note.length > 500)) {
      return null;
    }
    corrections.push({
      photoRegionId: c.photoRegionId,
      unit: c.unit as Correction["unit"],
      value: c.value,
      ...(typeof c.note === "string" && c.note.trim() ? { note: c.note.trim() } : {}),
    });
  }
  return corrections;
}

/**
 * POST { corrections: [{ photoRegionId, unit, value, note? }] }
 * → the rep's on-site corrections.
 *
 * A CONTRACTOR surface, and an authenticated one: the rep is the signed-in
 * contractor, not a name in the payload. Each correction becomes a
 * MeasurementDelta: the
 * superseded estimate with the provenance that produced it, and a new
 * quantity with source 'rep_confirmed' pointing back at it. Nothing here
 * touches the customer's frozen snapshot — the final quote is a separate,
 * additional record (POST ../quote).
 *
 * Corrections are recorded even when they match the estimate exactly: a
 * confirmed zero-error measurement is the evidence that the estimator
 * works, and dropping those would bias the corpus toward its own misses.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params;
  // A CONTRACTOR surface: this mints rep_confirmed quantities and writes to
  // the training corpus. Nobody reaches it with a project id alone.
  const auth = await requireContractor(request);
  if (auth.response) return auth.response;

  let body: { corrections?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Who corrected this comes from the session, never from the body. The
  // delta is the training corpus and correctedBy is its provenance;
  // provenance the caller can assert for itself is not provenance.
  const correctedBy = auth.contractor.name || auth.contractor.email;
  const corrections = parseCorrections(body.corrections);
  if (!corrections) {
    return NextResponse.json(
      {
        error:
          "corrections must be a non-empty array of { photoRegionId, unit: SF|LF, value > 0, note? }",
      },
      { status: 400 },
    );
  }

  try {
    const project = await getProject(projectId);
    const jobType = inferJobType(project.selections);
    if (!jobType) {
      return NextResponse.json(
        { error: "This design has no selections to confirm" },
        { status: 409 },
      );
    }

    // The quantities being superseded, resolved through the sensor
    // hierarchy: rep-confirmed (an earlier correction) > drawn aerial >
    // typology. A region the customer never designed has nothing to
    // correct, so it is rejected rather than invented.
    const org = await resolveOrg();
    const current = new Map<string, Quantity>();
    for (const q of currentRegionQuantities(project, org.typology)) {
      current.set(`${q.regionId}:SF`, q.areaSf);
      current.set(`${q.regionId}:LF`, q.perimeterLf);
    }

    const deltas: MeasurementDelta[] = [];
    const context = {
      projectId,
      jobType,
      marketContext: project.marketContext,
      correctedBy,
      regionLabels: regionLabels(project),
    };
    for (const correction of corrections) {
      const key = `${correction.photoRegionId}:${correction.unit}`;
      const before = current.get(key);
      if (!before) {
        return NextResponse.json(
          {
            error: `Region ${correction.photoRegionId} is not part of this design`,
          },
          { status: 400 },
        );
      }
      const delta = recordCorrection(correction, before, context);
      deltas.push(delta);
      // Two corrections to the same dimension in one request chain, rather
      // than both superseding the original — the lineage stays a line.
      current.set(key, delta.afterQty);
    }

    const updated = await appendDeltas(projectId, deltas);
    return NextResponse.json(
      { status: updated.status, deltas, totalDeltas: (updated.deltas ?? []).length },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (error instanceof ProjectStageError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof InvalidCorrectionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
