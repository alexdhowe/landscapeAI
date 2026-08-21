"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DesignProject, RegionSelection } from "@/lib/design/types";
import type { MarketContext } from "@/lib/pricing/typology";

import { CatalogPicker } from "./CatalogPicker";
import { PhotoCanvas } from "./PhotoCanvas";
import { PriceRail, type BandPayload } from "./PriceRail";

/**
 * The Phase 2 configurator: photo + segmentation overlay on the left,
 * catalog picker and budget band on the right. All pricing happens
 * server-side; this component only ever sees the customer-facing band.
 */
export function Configurator({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<DesignProject | null>(null);
  const [band, setBand] = useState<BandPayload | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const segmentationStarted = useRef(false);

  const refreshBand = useCallback(async () => {
    const res = await fetch("/api/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (res.ok) setBand((await res.json()) as BandPayload);
  }, [projectId]);

  // Load the project; kick off segmentation if it hasn't run yet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) {
        if (!cancelled) setError("This design could not be found.");
        return;
      }
      let loaded = (await res.json()) as DesignProject;
      if (cancelled) return;
      setProject(loaded);

      if (loaded.segmentation.status === "pending" && !segmentationStarted.current) {
        segmentationStarted.current = true;
        const visionRes = await fetch("/api/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        });
        if (cancelled) return;
        if (visionRes.ok || visionRes.status === 502) {
          loaded = (await visionRes.json()) as DesignProject;
          setProject(loaded);
        } else {
          setError("We couldn't analyze this photo. Try another one.");
        }
      }
      void refreshBand();
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshBand]);

  const applySelection = useCallback(
    async (regionId: string, selection: RegionSelection) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regionId, selection }),
        });
        if (res.ok) {
          setProject((await res.json()) as DesignProject);
          await refreshBand();
        }
      } finally {
        setBusy(false);
      }
    },
    [projectId, refreshBand],
  );

  const changeContext = useCallback(
    async (marketContext: MarketContext) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marketContext }),
        });
        if (res.ok) {
          setProject((await res.json()) as DesignProject);
          await refreshBand();
        }
      } finally {
        setBusy(false);
      }
    },
    [projectId, refreshBand],
  );

  if (error) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (!project) {
    return <p className="text-center text-sm text-neutral-500">Loading your design…</p>;
  }

  const seg = project.segmentation;
  const regions = seg.status === "ready" ? seg.regions : [];
  const selectedRegion = regions.find((r) => r.id === selectedRegionId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <div className="space-y-3">
        {seg.status === "pending" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            Analyzing your yard photo…
          </div>
        )}
        {seg.status === "failed" && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            Photo analysis failed: {seg.error}
          </div>
        )}
        {seg.status === "ready" && seg.source === "demo" && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
            Demo overlay — set <code className="font-mono">ANTHROPIC_API_KEY</code> to
            analyze your actual photo.
          </div>
        )}
        <PhotoCanvas
          photoUrl={`/api/projects/${project.id}/photo`}
          regions={regions}
          selections={project.selections}
          selectedRegionId={selectedRegionId}
          onSelectRegion={setSelectedRegionId}
        />
        {seg.status === "ready" && seg.cannotSee.length > 0 && (
          <p className="text-xs text-neutral-400">
            Not visible in this photo: {seg.cannotSee.join(", ")}.
          </p>
        )}
      </div>

      <div className="space-y-4">
        <PriceRail
          payload={band}
          context={project.marketContext}
          busy={busy}
          onContextChange={changeContext}
          projectId={project.id}
          addressDeclined={project.addressDeclined}
        />
        {selectedRegion ? (
          <CatalogPicker
            region={selectedRegion}
            selection={project.selections[selectedRegion.id]}
            busy={busy}
            onChange={(selection) => applySelection(selectedRegion.id, selection)}
          />
        ) : (
          regions.length > 0 && (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
              Click a labeled area on your photo to see what you can do with it.
            </div>
          )
        )}
      </div>
    </div>
  );
}
