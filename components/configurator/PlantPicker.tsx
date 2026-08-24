"use client";

import type { PlantOption } from "@/lib/catalog/plants";
import type { Planting, SegmentedRegion } from "@/lib/vision/types";

import { Button } from "@/components/ui/Button";
import { PlantSwatch } from "./plantGlyphs";

/**
 * Swapping one plant for another.
 *
 * The unit here is a single plant, which is what makes this different from
 * the surface picker: choosing a hydrangea affects the boxwood beside it
 * not at all. What the photo thinks is growing there is shown, because a
 * customer standing in their own yard is the authority on whether that is
 * right, and because "replacing your azalea" is a much clearer thing to
 * offer than "plant 3".
 *
 * Mature size sits on every row on purpose. A #3 container is a foot
 * across in the van and the same plant is five feet across in year five,
 * and the honest version of this feature is the one that says so before
 * the customer picks four of them for a two-foot gap.
 */
/** Habit groups, in the order the catalog sorts them. */
const GROUPS: { category: PlantOption["category"]; heading: string }[] = [
  { category: "evergreen_shrub", heading: "Evergreen shrubs" },
  { category: "shrub", heading: "Flowering & deciduous shrubs" },
  { category: "grass", heading: "Ornamental grasses" },
  { category: "perennial", heading: "Perennials" },
  { category: "tree", heading: "Trees" },
];

export function PlantPicker({
  region,
  planting,
  options,
  chosenOptionId,
  busy,
  onChoose,
  onClose,
}: {
  region: SegmentedRegion;
  planting: Planting;
  options: readonly PlantOption[];
  chosenOptionId?: string;
  busy: boolean;
  onChoose: (optionId: string | null) => void;
  onClose: () => void;
}) {
  const existing = planting.label?.trim();
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-bark-900">
            {existing ? `Swap the ${existing}` : "Swap this plant"}
          </h2>
          <p className="mt-0.5 text-xs text-bark-600">
            {region.label}
            {existing ? ` · currently ${existing}` : null}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the plant picker"
          className="tap-target -m-1 shrink-0 rounded-md p-1 text-bark-500 hover:text-bark-800"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="size-5">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {options.length === 0 ? (
        <p className="mt-3 text-sm text-bark-600">
          Nothing in this contractor&apos;s catalog suits this spot.
        </p>
      ) : (
        <>
          {/* `min-w-0` is not decoration. A <fieldset> takes its minimum
              width from its contents and ignores the grid track it sits
              in, so without this the picker pushed the whole 390px page
              sideways — 511px of scroll from one plant list. It is the
              only fieldset in the app, and this is why. */}
          <fieldset className="mt-4 min-w-0" disabled={busy}>
            <legend className="text-2xs font-semibold uppercase tracking-wider text-bark-500">
              Put something else here
            </legend>
            {/* A whole nursery in one list is a scroll to nowhere: grouped
                by habit, and scrolling inside its own box so the band and
                the send button stay where the customer left them. */}
            <div className="mt-2 max-h-[26rem] overflow-y-auto pr-0.5">
            {GROUPS.map(({ category, heading }) => {
              const inGroup = options.filter((o) => o.category === category);
              if (inGroup.length === 0) return null;
              return (
                <div key={category} className="mb-3 last:mb-0">
                  <h3 className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-bark-400">
                    {heading}
                  </h3>
            <ul className="space-y-1.5">
              {inGroup.map((option) => {
                const chosen = option.id === chosenOptionId;
                return (
                  <li key={option.id}>
                    <label
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors ${
                        chosen
                          ? "border-canopy-700 bg-canopy-50 ring-1 ring-canopy-700"
                          : "border-bark-200 bg-white hover:border-bark-300 hover:bg-bark-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`plant-${planting.id}`}
                        className="sr-only"
                        checked={chosen}
                        onChange={() => onChoose(option.id)}
                      />
                      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-bark-100">
                        <PlantSwatch kind={option.glyph} className="size-8" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-bark-900">
                          {option.label}
                        </span>
                        <span className="block truncate text-xs text-bark-600">
                          {option.form} · {option.matureHeightFt}&prime; tall ×{" "}
                          {option.matureSpreadFt}&prime; wide when grown ·{" "}
                          {option.foliage}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className={`grid size-5 shrink-0 place-items-center rounded-full border ${
                          chosen ? "border-canopy-700 bg-canopy-700" : "border-bark-300"
                        }`}
                      >
                        {chosen && (
                          <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="3" className="size-3">
                            <path d="M3.5 10.5 8 15l8.5-10" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
                </div>
              );
            })}
            </div>
          </fieldset>

          {chosenOptionId && (
            <Button
              tone="secondary"
              size="sm"
              className="mt-3"
              disabled={busy}
              onClick={() => onChoose(null)}
            >
              Keep {existing ? `the ${existing}` : "what is there"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The accessible path to the plants on the photo.
 *
 * The ellipses drawn over the picture are a pointer convenience and are
 * hidden from assistive technology — a plant is a shape with no accessible
 * name, and on a 390px photo four shrubs in one bed overlap badly enough
 * to steal each other's taps. This is the same fix the region strip is:
 * real buttons, in document order, 44px, no overlap.
 */
export function PlantStrip({
  region,
  plantSelections,
  catalog,
  selectedPlantingId,
  onSelectPlanting,
}: {
  region: SegmentedRegion;
  plantSelections: Record<string, string> | undefined;
  catalog: readonly PlantOption[];
  selectedPlantingId: string | null;
  onSelectPlanting: (plantingId: string) => void;
}) {
  const plantings = region.plantings ?? [];
  if (plantings.length === 0) return null;
  const byId = new Map(catalog.map((o) => [o.id, o]));
  return (
    <div className="mt-4 border-t border-bark-200 pt-3">
      <h3 className="text-2xs font-semibold uppercase tracking-wider text-bark-500">
        Plants in this area
      </h3>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {plantings.map((plant) => {
          const chosen = plantSelections?.[plant.id]
            ? byId.get(plantSelections[plant.id])
            : undefined;
          const isOpen = plant.id === selectedPlantingId;
          return (
            <li key={plant.id}>
              <button
                type="button"
                aria-pressed={isOpen}
                onClick={() => onSelectPlanting(plant.id)}
                className={`flex min-h-11 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  isOpen
                    ? "border-bark-900 bg-bark-900 text-white"
                    : "border-bark-300 bg-white text-bark-800 hover:border-bark-400 hover:bg-bark-50"
                }`}
              >
                <PlantSwatch
                  kind={chosen?.glyph ?? "shrub"}
                  className={`size-5 shrink-0 ${chosen ? "" : "opacity-45"}`}
                />
                <span className="font-medium">
                  {chosen ? chosen.label : plant.label?.trim() || "Plant"}
                </span>
                {chosen && plant.label?.trim() ? (
                  <span className={isOpen ? "text-bark-300" : "text-bark-500"}>
                    ← {plant.label.trim()}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
