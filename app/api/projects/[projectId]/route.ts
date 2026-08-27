import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getOption } from "@/lib/catalog/options";
import {
  canMovePlants,
  canRemovePlants,
  plantJobTypeForRegion,
  plantOptionsForRegion,
} from "@/lib/catalog/plants";
import {
  MAX_OUTLINE_POINTS,
  effectiveOutline,
  isUsableOutline,
} from "@/lib/design/outline";
import { confineToRegion, regionAtPoint } from "@/lib/design/plantPlacement";
import type { RegionSelection } from "@/lib/design/types";
import type { NormalizedPoint } from "@/lib/vision/types";
import { resolveOrg } from "@/lib/org/resolve";
import { regionOfPlanting } from "@/lib/store/gates";
import {
  ProjectLockedError,
  ProjectNotFoundError,
  UnknownPlantingError,
  UnknownRegionError,
  declineAddress,
  getProject,
  setLocation,
  setMarketContext,
  setPlantPosition,
  addPlant,
  setAddedPlant,
  setPlantSelection,
  setPlantingsCleared,
  setRegionOutline,
  setSelection,
} from "@/lib/store/projects";

type Params = { params: Promise<{ projectId: string }> };

/**
 * The most plants one request may take out.
 *
 * "Clear the plants" is one bed's worth, and the biggest bed anybody has
 * segmented held nine. A hundred is far past any real photograph and
 * bounds what one request can ask the store to write.
 */
const MAX_CLEARED_AT_ONCE = 100;

/** A point on the photograph: two numbers, both inside the frame. */
function isNormalizedPoint(value: unknown): value is NormalizedPoint {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
    )
  );
}

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
 *   { regionId, polygon }                         — the customer's own
 *                                                   correction to an
 *                                                   outline, or null to
 *                                                   put back the one the
 *                                                   segmentation produced
 *   { plantingId, plantOptionId }                 — swap one plant, or
 *                                                   null to put back what
 *                                                   is growing there
 *   { clearPlantings: string[], cleared: bool }   — take plants out of the
 *                                                   design, or put them
 *                                                   back
 *   { plantingId, plantAt: [x, y] | null }       — move one plant, or null
 *                                                   to put it back where
 *                                                   the photo found it
 *   { addPlant: { optionId, at: [x, y] } }       — put a plant in where
 *                                                   the photo had none
 *   { addedPlantId, plantAt: [x, y] | null }     — move an added plant,
 *                                                   or null to take it out
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
    plantingId?: unknown;
    plantOptionId?: unknown;
    plantAt?: unknown;
    addPlant?: unknown;
    addedPlantId?: unknown;
    clearPlantings?: unknown;
    cleared?: unknown;
    polygon?: unknown;
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

    // An outline correction. Checked before the selection branch, which
    // also carries a regionId.
    if (patch.polygon !== undefined) {
      if (typeof patch.regionId !== "string" || !patch.regionId.trim()) {
        return NextResponse.json({ error: "regionId must be a string" }, { status: 400 });
      }
      if (patch.polygon === null) {
        return NextResponse.json(
          await setRegionOutline(projectId, patch.regionId, null),
        );
      }
      // The browser is not trusted with this: an outline reaches the rep's
      // screen and the frozen snapshot.
      if (!isUsableOutline(patch.polygon)) {
        return NextResponse.json(
          {
            error: `polygon must be 3-${MAX_OUTLINE_POINTS} points inside the image that enclose an area`,
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        await setRegionOutline(projectId, patch.regionId, patch.polygon),
      );
    }

    // Taking plants out. Before the plantingId branch, which is about
    // replacing one plant; this is about a whole bed, and the two use
    // different keys precisely so neither can be mistaken for the other.
    if (patch.clearPlantings !== undefined) {
      const ids = patch.clearPlantings;
      if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        ids.length > MAX_CLEARED_AT_ONCE ||
        !ids.every((id) => typeof id === "string" && id.trim().length > 0)
      ) {
        return NextResponse.json(
          { error: `clearPlantings must be 1-${MAX_CLEARED_AT_ONCE} planting ids` },
          { status: 400 },
        );
      }
      if (typeof patch.cleared !== "boolean") {
        return NextResponse.json({ error: "cleared must be a boolean" }, { status: 400 });
      }
      const project = await getProject(projectId);
      for (const plantingId of ids) {
        if (!regionOfPlanting(project, plantingId)) {
          return NextResponse.json({ error: "Unknown plant" }, { status: 400 });
        }
      }
      // The same guardrail the plant catalog lives under (map section 1):
      // nothing may be selected that the pricing engine cannot price, and
      // the engine throws on an assembly this org's book does not hold.
      // Putting plants *back* is always allowed — it can only ever
      // subtract a line item.
      if (patch.cleared) {
        const org = await resolveOrg();
        if (!canRemovePlants(org.priceBook)) {
          return NextResponse.json(
            { error: "This contractor does not quote plant removal" },
            { status: 400 },
          );
        }
      }
      return NextResponse.json(
        await setPlantingsCleared(projectId, ids, patch.cleared),
      );
    }

    // Moving a plant. Before the plantOptionId branch, which also carries
    // a plantingId: these are different questions about the same plant,
    // and the key is what tells them apart.
    // Putting a plant in where the photograph had none. Before the two
    // branches keyed by a plant id, because this one names no plant yet.
    if (patch.addPlant !== undefined) {
      const spec = patch.addPlant;
      if (
        typeof spec !== "object" ||
        spec === null ||
        typeof (spec as { optionId?: unknown }).optionId !== "string"
      ) {
        return NextResponse.json(
          { error: "addPlant must be { optionId, at: [x, y] }" },
          { status: 400 },
        );
      }
      const { optionId, at } = spec as { optionId: string; at: unknown };
      if (!isNormalizedPoint(at)) {
        return NextResponse.json(
          { error: "at must be [x, y] between 0 and 1" },
          { status: 400 },
        );
      }
      const project = await getProject(projectId);
      const org = await resolveOrg();
      // Which bed it landed in is decided here, from the outlines, not by
      // whatever the pointer happened to be over — the photograph has a
      // texture and a handful of buttons on top of it and none of those
      // are the design.
      const regions = project.segmentation.status === "ready"
        ? project.segmentation.regions
        : [];
      const region = regionAtPoint(
        regions.map((r) => ({
          ...r,
          polygon: effectiveOutline(r, project.regionOutlines),
        })),
        at,
        (r) => plantJobTypeForRegion(r.kind) !== null,
      );
      if (!region) {
        return NextResponse.json(
          { error: "Drop a plant on a bed" },
          { status: 400 },
        );
      }
      // The catalog is the guardrail, and it is the catalog *for this
      // region*: an option id a browser made up buys nothing, and neither
      // does a shade tree dropped against the house. Same rule the swap
      // branch keeps, for the same reason.
      const offerable = plantOptionsForRegion(org.plantCatalog, region.kind);
      if (!offerable.some((option) => option.id === optionId)) {
        return NextResponse.json(
          { error: "That plant does not belong in this area" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        await addPlant(projectId, {
          id: `added_${randomUUID()}`,
          regionId: region.id,
          optionId,
          at: confineToRegion(region.polygon, at),
        }),
      );
    }

    // Moving one, or taking it back out. Its own branch because an added
    // plant has no planting id and no original spot to be put back to.
    if (patch.addedPlantId !== undefined) {
      if (typeof patch.addedPlantId !== "string" || !patch.addedPlantId.trim()) {
        return NextResponse.json(
          { error: "addedPlantId must be a string" },
          { status: 400 },
        );
      }
      const project = await getProject(projectId);
      const plant = (project.addedPlants ?? []).find(
        (candidate) => candidate.id === patch.addedPlantId,
      );
      if (!plant) {
        return NextResponse.json({ error: "Unknown plant" }, { status: 400 });
      }
      const to = patch.plantAt;
      if (to === null) {
        return NextResponse.json(await setAddedPlant(projectId, plant.id, null));
      }
      if (!isNormalizedPoint(to)) {
        return NextResponse.json(
          { error: "plantAt must be [x, y] between 0 and 1, or null" },
          { status: 400 },
        );
      }
      const regions = project.segmentation.status === "ready"
        ? project.segmentation.regions
        : [];
      const region = regions.find((candidate) => candidate.id === plant.regionId);
      const confined = region
        ? confineToRegion(
            effectiveOutline(region, project.regionOutlines),
            to,
          )
        : to;
      return NextResponse.json(
        await setAddedPlant(projectId, plant.id, confined),
      );
    }

    if (patch.plantAt !== undefined) {
      if (typeof patch.plantingId !== "string" || !patch.plantingId.trim()) {
        return NextResponse.json({ error: "plantingId must be a string" }, { status: 400 });
      }
      const project = await getProject(projectId);
      const region = regionOfPlanting(project, patch.plantingId);
      if (!region) {
        return NextResponse.json({ error: "Unknown plant" }, { status: 400 });
      }
      // null puts it back where the photo found it.
      if (patch.plantAt === null) {
        return NextResponse.json(
          await setPlantPosition(projectId, patch.plantingId, null),
        );
      }
      const at = patch.plantAt;
      if (
        !Array.isArray(at) ||
        at.length !== 2 ||
        !at.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)
      ) {
        return NextResponse.json(
          { error: "plantAt must be [x, y] between 0 and 1, or null" },
          { status: 400 },
        );
      }
      const org = await resolveOrg();
      if (!canMovePlants(org.priceBook)) {
        return NextResponse.json(
          { error: "This contractor does not quote moving a plant" },
          { status: 400 },
        );
      }
      // Confined server-side, not in the canvas: a browser can be told
      // anything, and the outline is what the crew will work to. A drop
      // just outside the bed lands on the nearest point inside rather
      // than being refused, because a fingertip on a phone misses by a
      // few pixels and refusing would read as the drag not working.
      const confined = confineToRegion(
        effectiveOutline(region, project.regionOutlines),
        [at[0], at[1]],
      );
      return NextResponse.json(
        await setPlantPosition(projectId, patch.plantingId, confined),
      );
    }

    if (patch.plantingId !== undefined) {
      if (typeof patch.plantingId !== "string" || !patch.plantingId.trim()) {
        return NextResponse.json({ error: "plantingId must be a string" }, { status: 400 });
      }
      // null puts back whatever is actually growing there.
      if (patch.plantOptionId === null) {
        return NextResponse.json(
          await setPlantSelection(projectId, patch.plantingId, null),
        );
      }
      if (typeof patch.plantOptionId !== "string") {
        return NextResponse.json(
          { error: "plantOptionId must be a string, or null to clear it" },
          { status: 400 },
        );
      }
      // The catalog is the guardrail, and it is the ORG's catalog: an
      // option id the browser invented, or one for a plant this
      // contractor has stopped stocking, buys nothing.
      const project = await getProject(projectId);
      const region = regionOfPlanting(project, patch.plantingId);
      if (!region) {
        return NextResponse.json({ error: "Unknown plant" }, { status: 400 });
      }
      const org = await resolveOrg();
      const offered = plantOptionsForRegion(org.plantCatalog, region.kind);
      if (!offered.some((option) => option.id === patch.plantOptionId)) {
        return NextResponse.json(
          { error: `Plant "${patch.plantOptionId}" is not offered for this area` },
          { status: 400 },
        );
      }
      return NextResponse.json(
        await setPlantSelection(projectId, patch.plantingId, patch.plantOptionId),
      );
    }

    if (typeof patch.regionId !== "string" || patch.selection === null || typeof patch.selection !== "object") {
      return NextResponse.json(
        { error: "Expected { regionId, selection }, { plantingId, plantOptionId } or { marketContext }" },
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
    if (error instanceof UnknownRegionError) {
      // Most likely a stale tab after a re-segmentation. The customer's
      // problem to see, not a 500.
      return NextResponse.json({ error: "Unknown region" }, { status: 400 });
    }
    if (error instanceof UnknownPlantingError) {
      // A choice about a plant this design does not have. Most likely a
      // stale tab after a re-segmentation, which is the customer's problem
      // to see rather than a 500.
      return NextResponse.json({ error: "Unknown plant" }, { status: 400 });
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
