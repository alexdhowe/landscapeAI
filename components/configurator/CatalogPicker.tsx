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
  onClose: () => void;
};

/**
 * Catalog options for the selected region, filtered to its kind. Surface
 * options are exclusive (radio behaviour, tap again to clear); add-ons
 * toggle independently. Every row is a 44px target — this is the control
 * a customer taps most, standing up, one-handed.
 */
export function CatalogPicker({ region, selection, busy, onChange, onClose }: Props) {
  const options = optionsForKind(region.kind);
  const surfaces = options.filter((o) => o.slot === "surface");
  const addons = options.filter((o) => o.slot === "addon");
  const current: RegionSelection = selection ?? { addonOptionIds: [] };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-bark-900">
            {region.label || REGION_KIND_LABELS[region.kind]}
          </h2>
          <p className="mt-0.5 text-xs text-bark-600">
            {REGION_KIND_LABELS[region.kind]}
            {region.existingMaterial ? ` · currently ${region.existingMaterial}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close this area"
          className="tap-target -mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-md text-bark-500 transition-colors hover:bg-bark-100 hover:text-bark-800"
        >
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            className="size-4"
          >
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>

      {options.length === 0 ? (
        <p className="rounded-lg bg-bark-100 p-3 text-sm text-bark-700">
          Nothing in the catalog for{" "}
          {REGION_KIND_LABELS[region.kind].toLowerCase()} yet — try a planting
          bed or foundation planting.
        </p>
      ) : (
        <>
          {surfaces.length > 0 && (
            <OptionGroup label="Swap the surface">
              {surfaces.map((option) => {
                const active = current.surfaceOptionId === option.id;
                return (
                  <OptionRow
                    key={option.id}
                    swatch={option.swatch}
                    label={option.label}
                    description={option.description}
                    active={active}
                    busy={busy}
                    role="radio"
                    onClick={() =>
                      onChange({
                        ...current,
                        surfaceOptionId: active ? undefined : option.id,
                      })
                    }
                  />
                );
              })}
            </OptionGroup>
          )}

          {addons.length > 0 && (
            <OptionGroup label="Add to this area">
              {addons.map((option) => {
                const active = current.addonOptionIds.includes(option.id);
                return (
                  <OptionRow
                    key={option.id}
                    swatch={option.swatch}
                    label={option.label}
                    description={option.description}
                    active={active}
                    busy={busy}
                    role="checkbox"
                    onClick={() =>
                      onChange({
                        ...current,
                        addonOptionIds: active
                          ? current.addonOptionIds.filter((id) => id !== option.id)
                          : [...current.addonOptionIds, option.id],
                      })
                    }
                  />
                );
              })}
            </OptionGroup>
          )}
        </>
      )}
    </div>
  );
}

function OptionGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-bark-500">
        {label}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function OptionRow({
  swatch,
  label,
  description,
  active,
  busy,
  role,
  onClick,
}: {
  swatch: React.ComponentProps<typeof SwatchChip>["swatch"];
  label: string;
  description: string;
  active: boolean;
  busy: boolean;
  role: "radio" | "checkbox";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={active}
      disabled={busy}
      onClick={onClick}
      className={`flex min-h-14 w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors disabled:opacity-50 ${
        active
          ? "border-canopy-600 bg-canopy-50 ring-1 ring-canopy-600"
          : "border-bark-200 bg-white hover:border-bark-400 hover:bg-bark-50"
      }`}
    >
      <SwatchChip swatch={swatch} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-bark-900">{label}</span>
        <span className="block truncate text-xs text-bark-600">{description}</span>
      </span>
      <span
        aria-hidden
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          active ? "border-canopy-700 bg-canopy-700 text-white" : "border-bark-300"
        }`}
      >
        {active ? (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.25" className="size-3">
            <path d="M3 8.5 6.2 12 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
    </button>
  );
}
