"use client";

import { optionsForKind } from "@/lib/catalog/options";
import type { RegionSelection } from "@/lib/design/types";
import type { SegmentedRegion } from "@/lib/vision/types";
import { REGION_KIND_LABELS } from "@/lib/vision/types";

import { SwatchChip } from "./swatches";

type Props = {
  region: SegmentedRegion;
  selection: RegionSelection | undefined;
  busy: boolean;
  onChange: (selection: RegionSelection) => void;
};

/**
 * Catalog options for the selected region, filtered to its kind. Surface
 * options are exclusive (radio behavior, click again to clear); add-ons
 * toggle independently.
 */
export function CatalogPicker({ region, selection, busy, onChange }: Props) {
  const options = optionsForKind(region.kind);
  const surfaces = options.filter((o) => o.slot === "surface");
  const addons = options.filter((o) => o.slot === "addon");
  const current: RegionSelection = selection ?? { addonOptionIds: [] };

  if (options.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
        <p className="font-medium text-neutral-800">
          {region.label || REGION_KIND_LABELS[region.kind]}
        </p>
        <p className="mt-1">
          Nothing in the catalog for {REGION_KIND_LABELS[region.kind].toLowerCase()} yet —
          try a planting bed or foundation planting.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-neutral-900">{region.label}</p>
        <p className="text-xs text-neutral-500">
          {REGION_KIND_LABELS[region.kind]}
          {region.existingMaterial ? ` · currently ${region.existingMaterial}` : ""}
        </p>
      </div>

      {surfaces.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Swap the surface
          </p>
          <div className="space-y-1.5">
            {surfaces.map((option) => {
              const active = current.surfaceOptionId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onChange({
                      ...current,
                      surfaceOptionId: active ? undefined : option.id,
                    })
                  }
                  className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition disabled:opacity-50 ${
                    active
                      ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600"
                      : "border-neutral-200 bg-white hover:border-neutral-400"
                  }`}
                >
                  <SwatchChip swatch={option.swatch} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-neutral-900">
                      {option.label}
                    </span>
                    <span className="block truncate text-xs text-neutral-500">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {addons.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Add to this area
          </p>
          <div className="space-y-1.5">
            {addons.map((option) => {
              const active = current.addonOptionIds.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onChange({
                      ...current,
                      addonOptionIds: active
                        ? current.addonOptionIds.filter((id) => id !== option.id)
                        : [...current.addonOptionIds, option.id],
                    })
                  }
                  className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition disabled:opacity-50 ${
                    active
                      ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600"
                      : "border-neutral-200 bg-white hover:border-neutral-400"
                  }`}
                >
                  <SwatchChip swatch={option.swatch} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-neutral-900">
                      {option.label}
                    </span>
                    <span className="block truncate text-xs text-neutral-500">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
