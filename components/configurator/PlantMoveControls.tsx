"use client";

import { plantPosition } from "@/lib/design/plantPlacement";
import type { NormalizedPoint, Planting, SegmentedRegion } from "@/lib/vision/types";

import { Button } from "@/components/ui/Button";

/**
 * Moving the plants that are already there.
 *
 * The product could swap a plant for another one and take a plant out,
 * and both of those quietly assumed the answer to "where do the plants
 * go" is "exactly where they are now". Nobody designing a bed thinks
 * that. This is the third verb: the same plant, somewhere else in the
 * same bed.
 *
 * ---------------------------------------------------------------------
 * There is no mode
 * ---------------------------------------------------------------------
 * The plants on the photo are draggable, always: put a finger on the
 * shrub and move it. A first pass put that behind a "Move the plants"
 * toggle and it was wrong — a toggle is a thing to find and turn on
 * before the direct thing works, which is the opposite of direct. Press
 * and lift opens the picker, press and travel moves the plant, and
 * `DRAG_THRESHOLD` in `PhotoCanvas` is where the two part company.
 *
 * ---------------------------------------------------------------------
 * So what is this panel for
 * ---------------------------------------------------------------------
 * The paths dragging cannot serve. Four buttons that step the open plant
 * a foot at a time: the keyboard and screen-reader route to the same
 * change, and on a phone the way to place a plant exactly after a thumb
 * got it roughly right. And a way back — one plant or all of them — which
 * a drag has no gesture for. Same reasoning as the edge nudges above it.
 */

/** One press, as a fraction of the frame. About a foot on a front yard. */
const NUDGE = 0.012;

export function PlantMoveControls({
  region,
  plantPositions,
  selectedPlanting,
  busy,
  onMove,
  onPutBack,
}: {
  region: SegmentedRegion;
  plantPositions: Record<string, NormalizedPoint> | undefined;
  /** The plant the customer has open, if any: what the nudges move. */
  selectedPlanting: Planting | null;
  busy: boolean;
  onMove: (plantingId: string, point: NormalizedPoint) => void;
  onPutBack: (plantingId: string) => void;
}) {
  // Nothing to move in a bed with no plants in it.
  if ((region.plantings ?? []).length === 0) return null;

  const movedIds = (region.plantings ?? [])
    .filter((plant) => plantPositions?.[plant.id])
    .map((plant) => plant.id);

  const nudge = (dx: number, dy: number) => {
    if (!selectedPlanting) return;
    const [x, y] = plantPosition(selectedPlanting, plantPositions);
    onMove(selectedPlanting.id, [
      Math.min(1, Math.max(0, x + dx)),
      Math.min(1, Math.max(0, y + dy)),
    ]);
  };

  return (
    <div className="mt-4 border-t border-bark-200 pt-3">
      <h3 className="text-2xs font-semibold uppercase tracking-wider text-bark-500">
        Where the plants sit
      </h3>
      <p className="mt-1.5 text-xs text-bark-600">
        Drag any plant on your photo to move it.
        {selectedPlanting
          ? " Or step the one you have open:"
          : " Pick one below to step it a little at a time."}
      </p>

      {selectedPlanting && (
        <div className="mt-2 grid w-fit grid-cols-3 gap-1">
          <span />
          <Button
            tone="secondary"
            size="sm"
            disabled={busy}
            onClick={() => nudge(0, -NUDGE)}
            aria-label={`Move ${plantName(selectedPlanting)} back`}
          >
            ↑
          </Button>
          <span />
          <Button
            tone="secondary"
            size="sm"
            disabled={busy}
            onClick={() => nudge(-NUDGE, 0)}
            aria-label={`Move ${plantName(selectedPlanting)} left`}
          >
            ←
          </Button>
          <Button
            tone="secondary"
            size="sm"
            disabled={busy}
            onClick={() => onPutBack(selectedPlanting.id)}
            aria-label={`Put ${plantName(selectedPlanting)} back where it was`}
          >
            ⟲
          </Button>
          <Button
            tone="secondary"
            size="sm"
            disabled={busy}
            onClick={() => nudge(NUDGE, 0)}
            aria-label={`Move ${plantName(selectedPlanting)} right`}
          >
            →
          </Button>
          <span />
          <Button
            tone="secondary"
            size="sm"
            disabled={busy}
            onClick={() => nudge(0, NUDGE)}
            aria-label={`Move ${plantName(selectedPlanting)} forward`}
          >
            ↓
          </Button>
          <span />
        </div>
      )}

      {movedIds.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-xs text-bark-600">
            {movedIds.length === 1 ? "1 plant moved" : `${movedIds.length} plants moved`}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => movedIds.forEach(onPutBack)}
            className="tap-target text-xs font-medium text-bark-600 underline underline-offset-4 hover:text-bark-900 disabled:opacity-50"
          >
            Put {movedIds.length === 1 ? "it" : "them all"} back
          </button>
        </div>
      )}
    </div>
  );
}

/** What the photo called this plant, when it managed to name it. */
function plantName(planting: Planting): string {
  return planting.label?.trim() || "this plant";
}
