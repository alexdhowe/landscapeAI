import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { assertValidRing, measureRing, ringAreaSf } from "@/lib/measure/area";
import {
  ProjectNotFoundError,
  getProject,
  removeAerialRegion,
  upsertAerialRegion,
} from "@/lib/store/projects";

type Params = { params: Promise<{ projectId: string }> };

/** Guard against fat-finger shapes: a parcel is not a county. */
const MAX_AREA_SF = 2_000_000;
const MIN_AREA_SF = 1;

/**
 * POST { photoRegionId, ring } → the project with the region measured.
 *
 * The client draws; the server measures. Quantities are computed here from
 * the ring and stored with provenance (source 'user_drawn' — the customer
 * drew or adjusted the polygon over the aerial; machine-detected geometry
 * with source 'aerial' is Phase 4+). One aerial polygon per photo region;
 * re-posting replaces it.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params;
  let body: { photoRegionId?: unknown; ring?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.photoRegionId !== "string") {
    return NextResponse.json({ error: "Missing photoRegionId" }, { status: 400 });
  }

  try {
    const project = await getProject(projectId);
    if (!project.location) {
      return NextResponse.json(
        { error: "Set a location before drawing on the aerial" },
        { status: 409 },
      );
    }
    if (
      project.segmentation.status !== "ready" ||
      !project.segmentation.regions.some((r) => r.id === body.photoRegionId)
    ) {
      return NextResponse.json({ error: "Unknown photo region" }, { status: 400 });
    }

    let ring;
    try {
      assertValidRing(body.ring);
      ring = body.ring;
      const areaSf = ringAreaSf(ring);
      if (areaSf < MIN_AREA_SF || areaSf > MAX_AREA_SF) {
        return NextResponse.json(
          { error: "That shape doesn't look like a yard area — try re-drawing it" },
          { status: 400 },
        );
      }
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof RangeError ? e.message : "Invalid ring" },
        { status: 400 },
      );
    }

    const { areaSf, perimeterLf } = measureRing(ring, "user_drawn", 0.85);
    const updated = await upsertAerialRegion(projectId, {
      id: randomUUID(),
      photoRegionId: body.photoRegionId,
      ring,
      areaSf,
      perimeterLf,
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    throw error;
  }
}

/** DELETE ?photoRegionId=… → the project with that measurement removed. */
export async function DELETE(request: Request, { params }: Params) {
  const { projectId } = await params;
  const photoRegionId = new URL(request.url).searchParams.get("photoRegionId");
  if (!photoRegionId) {
    return NextResponse.json({ error: "Missing photoRegionId" }, { status: 400 });
  }
  try {
    return NextResponse.json(await removeAerialRegion(projectId, photoRegionId));
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    throw error;
  }
}
