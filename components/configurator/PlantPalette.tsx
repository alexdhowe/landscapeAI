"use client";

import { useEffect, useRef, useState } from "react";

import type { PlantOption } from "@/lib/catalog/plants";
import type { NormalizedPoint } from "@/lib/vision/types";

import { PlantSwatch } from "./plantGlyphs";

/**
 * Plants to put in where the photograph never had one.
 *
 * ---------------------------------------------------------------------
 * The verb this completes
 * ---------------------------------------------------------------------
 * A customer could already swap a plant, take one out, and move one. All
 * three are *about* a plant the camera happened to see, and together they
 * are a rearrangement rather than a design. Nobody planning a bed only
 * ever wants a plant exactly where a plant already is.
 *
 * ---------------------------------------------------------------------
 * Dragging, and the reason it is not the only way in
 * ---------------------------------------------------------------------
 * The gesture is the obvious one: pick a plant off the strip and put it
 * where you want it, with the plant following your finger the whole way.
 * The strip owns the whole gesture rather than handing off to the canvas,
 * because a pointer that starts here and ends over the photograph belongs
 * to neither component — pointer capture keeps the moves coming after the
 * finger leaves this element, and the drop is resolved by asking the
 * document what is under it.
 *
 * A drag is also the one interaction a keyboard cannot make. So every
 * chip is a real button too: activating it drops the plant in the middle
 * of the bed the customer has open, and the nudges in `PlantMoveControls`
 * take it from there. That is not a lesser path bolted on — it is the
 * only path for a screen reader, and it has to actually work.
 */

/** How big the plant floating under the finger is drawn, in pixels. */
const GHOST_PX = 56;

export function PlantPalette({
  catalog,
  busy,
  /** Where a keyboard drop lands: the middle of the open bed. */
  fallbackPoint,
  onAdd,
}: {
  catalog: readonly PlantOption[];
  busy: boolean;
  fallbackPoint: NormalizedPoint | null;
  onAdd: (optionId: string, at: NormalizedPoint) => void;
}) {
  const [dragging, setDragging] = useState<{
    option: PlantOption;
    x: number;
    y: number;
    over: boolean;
  } | null>(null);
  // Read inside the window listeners, which are installed once and would
  // otherwise close over the first render's value.
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      setDragging((current) =>
        current
          ? {
              ...current,
              x: event.clientX,
              y: event.clientY,
              over: frameAt(event.clientX, event.clientY) !== null,
            }
          : current,
      );
    };
    const up = (event: PointerEvent) => {
      const current = draggingRef.current;
      setDragging(null);
      if (!current) return;
      const point = pointOnPhoto(event.clientX, event.clientY);
      if (point) onAdd(current.option.id, point);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", () => setDragging(null), { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging !== null, onAdd]);

  if (catalog.length === 0) return null;

  return (
    <div className="mt-4 border-t border-bark-200 pt-3">
      <h3 className="text-2xs font-semibold uppercase tracking-wider text-bark-500">
        Add a plant
      </h3>
      <p className="mt-1.5 text-xs text-bark-600">
        Drag one onto your photo. It is drawn at the size it grows to, so you
        can see whether it fits.
      </p>
      <ul className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
        {catalog.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              disabled={busy}
              // A press that travels drags; a press that lifts where it
              // started drops in the middle of the open bed, which is the
              // path a keyboard and a screen reader take.
              onPointerDown={(event) => {
                if (busy) return;
                setDragging({
                  option,
                  x: event.clientX,
                  y: event.clientY,
                  over: false,
                });
              }}
              onClick={() => {
                if (busy || !fallbackPoint) return;
                onAdd(option.id, fallbackPoint);
              }}
              className="tap-target flex w-24 shrink-0 touch-none flex-col items-center gap-1 rounded-lg border border-bark-200 bg-white p-2 text-center transition hover:border-canopy-400 disabled:opacity-50"
            >
              <PlantSwatch kind={option.glyph} className="size-8" />
              <span className="text-2xs font-medium leading-tight text-bark-800">
                {option.label}
              </span>
              <span className="text-2xs text-bark-500">
                {option.matureSpreadFt}ft wide
              </span>
            </button>
          </li>
        ))}
      </ul>

      {dragging && (
        // Under the finger, and out of the way of hit-testing: the drop
        // asks the document what is beneath the pointer, and a ghost that
        // answered "me" would make every drop land on itself.
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: dragging.x,
            top: dragging.y,
            width: GHOST_PX,
            height: GHOST_PX,
            opacity: dragging.over ? 1 : 0.5,
          }}
        >
          <PlantSwatch kind={dragging.option.glyph} className="size-full" />
        </div>
      )}
    </div>
  );
}

/** The photo frame under this point, if the pointer is over one. */
function frameAt(x: number, y: number): HTMLElement | null {
  const element = document.elementFromPoint(x, y);
  return element instanceof Element
    ? (element.closest("[data-photo-frame]") as HTMLElement | null)
    : null;
}

/** Where on the photograph this pointer is, in normalized units. */
function pointOnPhoto(x: number, y: number): NormalizedPoint | null {
  const frame = frameAt(x, y);
  if (!frame) return null;
  const box = frame.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return null;
  return [
    Math.min(1, Math.max(0, (x - box.left) / box.width)),
    Math.min(1, Math.max(0, (y - box.top) / box.height)),
  ];
}
