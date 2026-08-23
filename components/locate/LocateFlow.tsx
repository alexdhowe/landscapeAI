"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BandMeter } from "@/components/configurator/BandMeter";
import type { BandPayload } from "@/components/configurator/PriceRail";
import type { EditSession } from "@/components/map/AerialMap";
import type { DesignProject } from "@/lib/design/types";
import { rectangleRing, ringAreaSf, type LngLat } from "@/lib/measure/area";
import { REGION_KIND_LABELS, type RegionKind, type SegmentedRegion } from "@/lib/vision/types";

// MapLibre needs the DOM; keep it out of the server render entirely.
const AerialMap = dynamic(
  () => import("@/components/map/AerialMap").then((m) => m.AerialMap),
  { ssr: false, loading: () => <MapPlaceholder /> },
);

function MapPlaceholder() {
  return (
    <div className="flex h-[420px] w-full items-center justify-center rounded-xl border border-bark-200 bg-bark-100 text-sm text-bark-500 sm:h-[520px]">
      Loading aerial…
    </div>
  );
}

type GeocodeCandidate = {
  label: string;
  lat: number;
  lng: number;
  source: "nominatim" | "demo";
};

/** Starter sizes for the auto-suggested shape — a drawing aid, never a price. */
const SUGGEST_AREA_SF: Record<RegionKind, number> = {
  bed: 300,
  foundation_planting: 250,
  turf: 800,
  hardscape: 200,
};

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

type Measuring = {
  photoRegionId: string;
  session: EditSession;
  pendingRing: LngLat[] | null;
  saving: boolean;
};

/**
 * Phase 3: address → aerial → draw → measured band. The customer confirms
 * their address (or declines and keeps the typology band), outlines each
 * designed area over satellite imagery — auto-suggested shapes are
 * adjustable — and watches the budget band narrow as real quantities
 * replace typology percentiles.
 */
export function LocateFlow({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<DesignProject | null>(null);
  const [band, setBand] = useState<BandPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<GeocodeCandidate[] | null>(null);

  const [measuring, setMeasuring] = useState<Measuring | null>(null);
  const sessionKey = useRef(0);

  const refreshBand = useCallback(async () => {
    const res = await fetch("/api/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (res.ok) setBand((await res.json()) as BandPayload);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) {
        if (!cancelled) setError("This design could not be found.");
        return;
      }
      const loaded = (await res.json()) as DesignProject;
      if (cancelled) return;
      setProject(loaded);
      void refreshBand();
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshBand]);

  const patchProject = useCallback(
    async (body: unknown): Promise<DesignProject | null> => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const updated = (await res.json()) as DesignProject;
      setProject(updated);
      return updated;
    },
    [projectId],
  );

  const search = useCallback(async () => {
    setSearching(true);
    setCandidates(null);
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (res.ok) {
        const result = (await res.json()) as { candidates: GeocodeCandidate[] };
        setCandidates(result.candidates);
      } else {
        setCandidates([]);
      }
    } finally {
      setSearching(false);
    }
  }, [query]);

  const chooseCandidate = useCallback(
    async (candidate: GeocodeCandidate) => {
      await patchProject({
        location: {
          address: candidate.label,
          lat: candidate.lat,
          lng: candidate.lng,
          source: candidate.source,
        },
      });
      setCandidates(null);
    },
    [patchProject],
  );

  const startMeasuring = useCallback(
    (photoRegionId: string, seedRing: LngLat[] | null) => {
      sessionKey.current += 1;
      setMeasuring({
        photoRegionId,
        session: { key: sessionKey.current, seedRing },
        pendingRing: seedRing,
        saving: false,
      });
    },
    [],
  );

  const saveMeasurement = useCallback(async () => {
    if (!measuring?.pendingRing) return;
    setMeasuring((m) => (m ? { ...m, saving: true } : m));
    try {
      const res = await fetch(`/api/projects/${projectId}/aerial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoRegionId: measuring.photoRegionId,
          ring: measuring.pendingRing,
        }),
      });
      if (res.ok) {
        setProject((await res.json()) as DesignProject);
        setMeasuring(null);
        await refreshBand();
      } else {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not save that area.");
        setMeasuring((m) => (m ? { ...m, saving: false } : m));
      }
    } catch {
      setMeasuring((m) => (m ? { ...m, saving: false } : m));
    }
  }, [measuring, projectId, refreshBand]);

  const removeMeasurement = useCallback(
    async (photoRegionId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/aerial?photoRegionId=${encodeURIComponent(photoRegionId)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setProject((await res.json()) as DesignProject);
        await refreshBand();
      }
    },
    [projectId, refreshBand],
  );

  const segRegions: SegmentedRegion[] = useMemo(
    () =>
      project?.segmentation.status === "ready" ? project.segmentation.regions : [],
    [project],
  );
  const hasChoice = useCallback(
    (regionId: string) => {
      const sel = project?.selections[regionId];
      return Boolean(sel && (sel.surfaceOptionId || sel.addonOptionIds.length > 0));
    },
    [project],
  );
  // Designed areas first — measuring those is what narrows the band.
  const orderedRegions = useMemo(
    () =>
      [...segRegions].sort(
        (a, b) => Number(hasChoice(b.id)) - Number(hasChoice(a.id)),
      ),
    [segRegions, hasChoice],
  );
  const aerialByPhotoRegion = useMemo(() => {
    const map = new Map(
      (project?.aerialRegions ?? []).map((r) => [r.photoRegionId, r]),
    );
    return map;
  }, [project]);
  const committed = useMemo(
    () =>
      (project?.aerialRegions ?? []).flatMap((r) => {
        const seg = segRegions.find((s) => s.id === r.photoRegionId);
        return seg ? [{ ...r, kind: seg.kind, label: seg.label }] : [];
      }),
    [project, segRegions],
  );

  if (error && !project) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-clay-200 bg-clay-50 p-6 text-sm text-clay-700">
        {error}
      </div>
    );
  }
  if (!project) {
    return <p className="text-center text-sm text-bark-500">Loading your design…</p>;
  }

  const location = project.location;

  // ---- Step 1: no address yet -----------------------------------------
  if (!location) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="rounded-xl border border-bark-200 bg-white p-5 shadow-e1">
          <h2 className="text-base font-semibold text-bark-900">
            Where is this yard?
          </h2>
          <p className="mt-1 text-sm text-bark-500">
            We&apos;ll pull aerial imagery of your property so you can outline the
            real areas — and your budget range narrows to your actual yard.
          </p>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Street address, city, state"
              className="min-h-11 w-full rounded-lg border border-bark-300 px-3 py-2.5 text-base text-bark-900 transition-colors placeholder:text-bark-500 hover:border-bark-400"
            />
            <button
              type="submit"
              disabled={searching || query.trim().length < 3}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-survey-700 px-4 text-sm font-medium text-white shadow-e1 transition-colors hover:bg-survey-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {searching ? "Searching…" : "Find it"}
            </button>
          </form>

          {candidates && candidates.length === 0 && (
            <p className="mt-3 text-sm text-bark-600">
              No matches — try adding the city and state.
            </p>
          )}
          {candidates && candidates.length > 0 && (
            <ul className="mt-3 divide-y divide-bark-100 rounded-lg border border-bark-200">
              {candidates.map((c) => (
                <li key={`${c.lat},${c.lng}`}>
                  <button
                    type="button"
                    onClick={() => void chooseCandidate(c)}
                    className="flex min-h-11 w-full items-center px-3 py-2.5 text-left text-sm text-bark-800 transition-colors hover:bg-survey-50"
                  >
                    {c.label}
                    {c.source === "demo" && (
                      <span className="ml-2 rounded-full bg-survey-100 px-2 py-0.5 text-xs text-survey-700">
                        demo pin
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="text-center text-sm text-bark-500">
          <button
            type="button"
            onClick={() => {
              void patchProject({ addressDeclined: true });
            }}
            className="underline decoration-bark-300 underline-offset-2 hover:text-bark-700"
          >
            Prefer not to share an address? Keep your estimate range
          </button>
        </div>
        {project.addressDeclined && (
          <div className="rounded-lg border border-bark-200 bg-bark-50 px-4 py-3 text-center text-sm text-bark-600">
            No problem — your design and budget range are saved.{" "}
            <Link href={`/design/${projectId}`} className="font-medium text-survey-700">
              Back to your design →
            </Link>
          </div>
        )}
      </div>
    );
  }

  // ---- Step 2: address set — draw and measure --------------------------
  const measuredBand = band?.band?.basis === "measured" ? band.band : null;
  const pendingAreaSf = measuring?.pendingRing
    ? Math.round(ringAreaSf(measuring.pendingRing))
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="truncate text-bark-600" title={location.address}>
            📍 {location.address}
          </p>
          <button
            type="button"
            onClick={() => {
              setCandidates(null);
              setMeasuring(null);
              setProject({ ...project, location: undefined });
            }}
            className="shrink-0 text-xs text-bark-500 underline underline-offset-2 hover:text-bark-600"
          >
            change address
          </button>
        </div>
        {location.source === "demo" && (
          <div className="rounded-lg border border-survey-200 bg-survey-50 px-4 py-2.5 text-sm text-survey-800">
            Demo pin — the geocoder was unreachable, so this aerial is a stand-in
            location, not your address.
          </div>
        )}
        {measuring && (
          <div className="rounded-lg border border-flag-200 bg-flag-50 px-4 py-2.5 text-sm text-flag-800">
            {measuring.session.seedRing
              ? "Drag the corners (or the shape) to match the real area, then save."
              : "Click the map to outline the area; click the first point again to close it."}
            {pendingAreaSf !== null && (
              <span className="ml-1 font-medium">
                Current: {pendingAreaSf.toLocaleString("en-US")} SF
              </span>
            )}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-clay-200 bg-clay-50 px-4 py-2.5 text-sm text-clay-700">
            {error}
          </div>
        )}
        <AerialMap
          center={{ lat: location.lat, lng: location.lng }}
          committed={committed}
          hiddenPhotoRegionId={measuring?.photoRegionId ?? null}
          editSession={measuring?.session ?? null}
          onRingChanged={(ring) => {
            setError(null);
            setMeasuring((m) => (m ? { ...m, pendingRing: ring } : m));
          }}
        />
        <p className="text-xs text-bark-500">
          Areas are measured geodesically from what you draw — aerial imagery is
          for reference. A rep confirms all quantities on site before any final
          quote.
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-bark-200 bg-white p-4 shadow-e1">
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-bark-500">
            Budget range
          </h2>
          {band?.band ? (
            <div className="mt-2">
              <p className="tnum display text-3xl text-bark-900">
                {usd(band.band.low)} – {usd(band.band.high)}
              </p>
              {measuredBand && band.typologyBand ? (
                <div className="mt-3">
                  <BandMeter outer={band.typologyBand} inner={measuredBand} />
                  <p className="mt-1.5 text-xs text-canopy-700">
                    Narrowed from {usd(band.typologyBand.low)} –{" "}
                    {usd(band.typologyBand.high)} using your measurements.
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-bark-500">
                  Based on typical projects — outline a designed area below to
                  narrow it.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-bark-500">
              Pick materials on your photo first — then measuring narrows the
              price.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-bark-200 bg-white p-4 shadow-e1">
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-bark-500">
            Your areas
          </h2>
          <ul className="mt-2 divide-y divide-bark-100">
            {orderedRegions.map((region) => {
              const aerial = aerialByPhotoRegion.get(region.id);
              const isMeasuring = measuring?.photoRegionId === region.id;
              const designed = hasChoice(region.id);
              return (
                <li key={region.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-bark-800">
                        {region.label}
                        {designed && (
                          <span className="ml-1.5 rounded-full bg-canopy-100 px-1.5 py-0.5 text-2xs font-medium text-canopy-700">
                            in your design
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-bark-500">
                        {REGION_KIND_LABELS[region.kind]}
                        {aerial &&
                          ` · ${Math.round(aerial.areaSf.value).toLocaleString("en-US")} SF · ${Math.round(
                            aerial.perimeterLf.value,
                          ).toLocaleString("en-US")} LF edge`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {isMeasuring ? (
                      <>
                        <button
                          type="button"
                          disabled={!measuring?.pendingRing || measuring.saving}
                          onClick={() => void saveMeasurement()}
                          className="tap-target inline-flex min-h-9 items-center rounded-lg bg-canopy-700 px-3 text-xs font-medium text-white transition-colors hover:bg-canopy-800 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {measuring?.saving ? "Saving…" : "Save this area"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMeasuring(null)}
                          className="rounded-lg border border-bark-300 px-2.5 py-1 text-xs text-bark-600 transition hover:bg-bark-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startMeasuring(region.id, aerial?.ring ?? null)}
                          className="rounded-lg border border-bark-300 px-2.5 py-1 text-xs text-bark-700 transition hover:bg-bark-50"
                        >
                          {aerial ? "Re-draw" : "Draw on map"}
                        </button>
                        {!aerial && (
                          <button
                            type="button"
                            onClick={() =>
                              startMeasuring(
                                region.id,
                                rectangleRing(
                                  { lat: location.lat, lng: location.lng },
                                  SUGGEST_AREA_SF[region.kind],
                                ),
                              )
                            }
                            className="rounded-lg border border-bark-300 px-2.5 py-1 text-xs text-bark-700 transition hover:bg-bark-50"
                          >
                            Suggest a shape
                          </button>
                        )}
                        {aerial && (
                          <button
                            type="button"
                            onClick={() => void removeMeasurement(region.id)}
                            className="tap-target inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-medium text-bark-600 transition-colors hover:text-clay-700"
                          >
                            Remove
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <Link
          href={`/design/${projectId}`}
          className="flex min-h-11 w-full items-center justify-center rounded-lg bg-bark-900 px-4 text-sm font-medium text-white shadow-e1 transition-colors hover:bg-bark-800"
        >
          {measuredBand ? "Done — back to your design" : "Back to your design"}
        </Link>
      </div>
    </div>
  );
}
