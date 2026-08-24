"use client";

import { insetOutline } from "@/lib/design/outline";
import type { NormalizedPoint } from "@/lib/vision/types";

import { Button } from "@/components/ui/Button";

/**
 * Correcting a region's edge.
 *
 * Three rounds of prompt work got the outlines close and not exact, and
 * past a point that is what placing polygon vertices from a photograph
 * does rather than a prompt that needs another go. The person holding the
 * phone is standing in the yard and can see where the mulch stops.
 *
 * Two ways to say so, and the second is not a lesser one:
 *
 *   **Drag the edge** — exact, local, and the only way to fix an outline
 *   that is right along one side and wrong along another. Needs a pointer
 *   and a steady hand.
 *
 *   **Nudge the whole edge in or out** — one press, no aiming, and it
 *   fixes the failure that actually gets reported: an outline that sits a
 *   little outside the bed's stone border all the way round. It is also
 *   the keyboard and screen-reader path, which is why it is a pair of real
 *   buttons rather than a slider.
 */
const NUDGE = 0.004;

export function OutlineControls({
  regionLabel,
  polygon,
  adjusted,
  busy,
  editing,
  onToggleEditing,
  onChange,
  onReset,
}: {
  regionLabel: string;
  /** The outline as it stands — corrected if it has been. */
  polygon: NormalizedPoint[];
  /** Whether this region's outline has been corrected at all. */
  adjusted: boolean;
  busy: boolean;
  editing: boolean;
  onToggleEditing: () => void;
  onChange: (polygon: NormalizedPoint[]) => void;
  onReset: () => void;
}) {
  return (
    <div className="mt-4 border-t border-bark-200 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-2xs font-semibold uppercase tracking-wider text-bark-500">
          The edge of this area
        </h3>
        <Button
          tone={editing ? "neutral" : "secondary"}
          size="sm"
          disabled={busy}
          onClick={onToggleEditing}
          aria-pressed={editing}
        >
          {editing ? "Done adjusting" : "Adjust the edge"}
        </Button>
      </div>

      {editing && (
        <>
          <p className="mt-2 text-xs text-bark-600">
            Drag the line on your photo to move it. Or move the whole edge
            at once:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              tone="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onChange(insetOutline(polygon, NUDGE))}
            >
              Pull the edge in
            </Button>
            <Button
              tone="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onChange(insetOutline(polygon, -NUDGE))}
            >
              Push it out
            </Button>
          </div>
          <p className="mt-2 text-xs text-bark-500">
            If the line sits on the stones or edging around{" "}
            {regionLabel.toLowerCase()}, pull it in — the border is not part
            of the bed, and whatever you choose is only painted inside the
            line.
          </p>
        </>
      )}

      {adjusted && (
        <Button
          tone="ghost"
          size="sm"
          className="mt-2"
          disabled={busy}
          onClick={onReset}
        >
          Put back the edge we found
        </Button>
      )}
    </div>
  );
}
