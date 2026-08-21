import { NextResponse } from "next/server";

import { getOption } from "@/lib/catalog/options";
import type { RegionSelection } from "@/lib/design/types";
import {
  ProjectLockedError,
  ProjectNotFoundError,
  declineAddress,
  getProject,
  setLocation,
  setMarketContext,
  setSelection,
} from "@/lib/store/projects";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  try {
    return NextResponse.json(await getProject(projectId));
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    throw error;
  }
}

/**
 * PATCH body is one of:
 *   { regionId, selection: { surfaceOptionId?, addonOptionIds } }
 *   { marketContext: "residential" | "hoa_commercial" }
 *   { location: { address, lat, lng, source } }   — confirmed geocode pick
 *   { addressDeclined: true }                     — the no-address path
 */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const patch = body as {
    regionId?: unknown;
    selection?: unknown;
    marketContext?: unknown;
    location?: unknown;
    addressDeclined?: unknown;
  };

  try {
    if (patch.addressDeclined !== undefined) {
      if (patch.addressDeclined !== true) {
        return NextResponse.json({ error: "addressDeclined must be true" }, { status: 400 });
      }
      return NextResponse.json(await declineAddress(projectId));
    }

    if (patch.location !== undefined) {
      const loc = patch.location as {
        address?: unknown;
        lat?: unknown;
        lng?: unknown;
        source?: unknown;
      } | null;
      if (
        loc === null ||
        typeof loc !== "object" ||
        typeof loc.address !== "string" ||
        loc.address.trim().length < 3 ||
        loc.address.length > 300 ||
        typeof loc.lat !== "number" ||
        typeof loc.lng !== "number" ||
        !Number.isFinite(loc.lat) ||
        !Number.isFinite(loc.lng) ||
        Math.abs(loc.lat) > 90 ||
        Math.abs(loc.lng) > 180 ||
        (loc.source !== "nominatim" && loc.source !== "demo")
      ) {
        return NextResponse.json(
          { error: "location must be { address, lat, lng, source }" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        await setLocation(projectId, {
          address: loc.address.trim(),
          lat: loc.lat,
          lng: loc.lng,
          source: loc.source,
          capturedAt: new Date().toISOString(),
        }),
      );
    }

    if (patch.marketContext !== undefined) {
      if (patch.marketContext !== "residential" && patch.marketContext !== "hoa_commercial") {
        return NextResponse.json({ error: "Invalid marketContext" }, { status: 400 });
      }
      return NextResponse.json(await setMarketContext(projectId, patch.marketContext));
    }

    if (typeof patch.regionId !== "string" || patch.selection === null || typeof patch.selection !== "object") {
      return NextResponse.json(
        { error: "Expected { regionId, selection } or { marketContext }" },
        { status: 400 },
      );
    }

    const project = await getProject(projectId);
    if (
      project.segmentation.status !== "ready" ||
      !project.segmentation.regions.some((r) => r.id === patch.regionId)
    ) {
      return NextResponse.json({ error: "Unknown region" }, { status: 400 });
    }
    const region = project.segmentation.regions.find((r) => r.id === patch.regionId)!;

    const raw = patch.selection as { surfaceOptionId?: unknown; addonOptionIds?: unknown };
    const selection: RegionSelection = { addonOptionIds: [] };

    if (raw.surfaceOptionId !== undefined) {
      if (typeof raw.surfaceOptionId !== "string") {
        return NextResponse.json({ error: "surfaceOptionId must be a string" }, { status: 400 });
      }
      const option = getOption(raw.surfaceOptionId);
      if (!option || option.slot !== "surface" || !option.appliesTo.includes(region.kind)) {
        return NextResponse.json(
          { error: `Option "${raw.surfaceOptionId}" is not a surface option for this region` },
          { status: 400 },
        );
      }
      selection.surfaceOptionId = option.id;
    }

    const addonIds = Array.isArray(raw.addonOptionIds) ? raw.addonOptionIds : [];
    for (const id of addonIds) {
      if (typeof id !== "string") {
        return NextResponse.json({ error: "addonOptionIds must be strings" }, { status: 400 });
      }
      const option = getOption(id);
      if (!option || option.slot !== "addon" || !option.appliesTo.includes(region.kind)) {
        return NextResponse.json(
          { error: `Option "${id}" is not an add-on for this region` },
          { status: 400 },
        );
      }
      if (!selection.addonOptionIds.includes(id)) selection.addonOptionIds.push(id);
    }

    return NextResponse.json(await setSelection(projectId, patch.regionId, selection));
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (error instanceof ProjectLockedError) {
      return NextResponse.json(
        { error: "This design has been submitted and is locked" },
        { status: 409 },
      );
    }
    throw error;
  }
}
