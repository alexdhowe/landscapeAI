"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { renderModeForProject } from "@/lib/design/render";
import type { DesignProject, RegionSelection } from "@/lib/design/types";
import type { MarketContext } from "@/lib/pricing/typology";

import { Badge } from "@/components/ui/Badge";
import { Callout, Card } from "@/components/ui/Card";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

import { CatalogPicker } from "./CatalogPicker";
import { PhotoCanvas, RegionStrip } from "./PhotoCanvas";
import { PriceRail, type BandPayload } from "./PriceRail";
import { SubmitLead } from "./SubmitLead";

/**
 * The Phase 2 configurator.
 *
 * Mobile-first: on a phone it is one column in the order the customer
 * needs it — their photo, the budget range, then what they can change.
 * On a desktop the range and the picker move into a rail beside the photo.
 * All pricing happens server-side; this component only ever sees the
 * customer-facing band.
 */
export function Configurator({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<DesignProject | null>(null);
  const [band, setBand] = useState<BandPayload | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const segmentationStarted = useRef(false);
  const pickerRef = useRef<HTMLDivElement>(null);

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

  // After submit the server has locked the project — reload so the UI
  // reflects the submitted status everywhere.
  const reloadProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`);
    if (res.ok) setProject((await res.json()) as DesignProject);
    await refreshBand();
  }, [projectId, refreshBand]);

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

  /** On a phone the picker is below the fold — bring it to the customer. */
  const selectRegion = useCallback((regionId: string) => {
    setSelectedRegionId(regionId);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() =>
        pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      );
    }
  }, []);

  if (error) {
    return (
      <Callout tone="clay" title="We couldn't open this design" role="alert">
        <p className="mt-1">{error}</p>
        <a
          href="/start"
          className="mt-3 inline-flex min-h-11 items-center font-medium underline underline-offset-4"
        >
          Start again with a photo
        </a>
      </Callout>
    );
  }

  if (!project) return <ConfiguratorSkeleton />;

  const seg = project.segmentation;
  const locked = project.status === "submitted";
  const regions = seg.status === "ready" ? seg.regions : [];
  const selectedRegion = regions.find((r) => r.id === selectedRegionId) ?? null;
  // Rendering is gated by confidence (architectural invariant): once a
  // quantity has been measured, only deterministic rendering — generated
  // from the design graph — may sit next to the numbers.
  const deterministic = renderModeForProject(project) === "deterministic";

  return (
    // One column on a phone, in the order someone standing outside needs
    // it: their photo, the areas in it, the budget, then the footnotes.
    // Two columns from `lg`, where the footnotes belong under the photo.
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-7 lg:gap-y-4">
      <div className="order-1 min-w-0 space-y-3 lg:col-start-1 lg:row-start-1">
        {locked && (
          <Callout tone="canopy" title="Sent to the contractor">
            <p className="mt-0.5">
              {project.submittedAt
                ? `Sent on ${new Date(project.submittedAt).toLocaleDateString("en-US", {
                    dateStyle: "long",
                  })}. `
                : null}
              This design is locked while a rep reviews it.
            </p>
          </Callout>
        )}
        {seg.status === "failed" && (
          <Callout tone="clay" title="We couldn't read that photo" role="alert">
            <p className="mt-0.5">{seg.error}</p>
            <a
              href="/start"
              className="mt-2 inline-flex min-h-11 items-center font-medium underline underline-offset-4"
            >
              Try a different photo
            </a>
          </Callout>
        )}
        {seg.status === "ready" && seg.source === "demo" && (
          <Callout tone="flag" title="Demo overlay — not your actual photo">
            <p className="mt-0.5">
              These areas are a fixed example, not something read off your
              picture. Set <code className="font-mono text-xs">ANTHROPIC_API_KEY</code>{" "}
              to analyse the real thing.
            </p>
          </Callout>
        )}

        <PhotoCanvas
          photoUrl={`/api/projects/${project.id}/photo`}
          regions={regions}
          selections={project.selections}
          selectedRegionId={selectedRegionId}
          onSelectRegion={selectRegion}
          pending={seg.status === "pending"}
        />

        {regions.length > 0 && (
          <RegionStrip
            regions={regions}
            selections={project.selections}
            selectedRegionId={selectedRegionId}
            onSelectRegion={selectRegion}
          />
        )}

        {seg.status === "ready" && regions.length === 0 && (
          <Callout tone="flag" title="No landscape areas found in this photo">
            <p className="mt-0.5">
              A wider shot from the driveway or the front walk usually works
              better than a close-up.{" "}
              <a href="/start" className="font-medium underline underline-offset-4">
                Try another photo
              </a>
              .
            </p>
          </Callout>
        )}

      </div>

      <div className="order-3 min-w-0 space-y-1.5 px-0.5 lg:order-none lg:col-start-1 lg:row-start-2">
          {deterministic && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-bark-600">
              <Badge tone="canopy">Measured view</Badge>
              Your yard has been measured, so this preview is drawn exactly from
              your design — nothing is imagined from here on.
            </p>
          )}
          {seg.status === "ready" && (seg.verticalElements ?? []).length > 0 && (
            <p className="text-xs text-bark-600">
              Also noticed: {seg.verticalElements.map((v) => v.description).join("; ")}.
            </p>
          )}
          {seg.status === "ready" && seg.cannotSee.length > 0 && (
            <p className="text-xs text-bark-500">
              Not visible in this photo: {seg.cannotSee.join(", ")}.
            </p>
          )}
      </div>

      <div className="order-2 min-w-0 space-y-4 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-6 lg:self-start">
        <PriceRail
          payload={band}
          context={project.marketContext}
          busy={busy || locked}
          onContextChange={changeContext}
          projectId={project.id}
          addressDeclined={project.addressDeclined}
          locked={locked}
          pending={seg.status === "pending"}
        />
        <div ref={pickerRef} className="scroll-mt-4">
          {!locked &&
            (selectedRegion ? (
              <Card className="p-4">
                <CatalogPicker
                  region={selectedRegion}
                  selection={project.selections[selectedRegion.id]}
                  busy={busy}
                  onChange={(selection) => applySelection(selectedRegion.id, selection)}
                  onClose={() => setSelectedRegionId(null)}
                />
              </Card>
            ) : null)}
        </div>
        <SubmitLead
          projectId={project.id}
          submitted={locked}
          canSubmit={Boolean(band?.band)}
          onSubmitted={() => void reloadProject()}
        />
      </div>
    </div>
  );
}

/**
 * The first paint, before the project has been fetched.
 *
 * In the shape of what is coming, so the page does not jump when it
 * arrives — the photo block is the same aspect ratio the canvas will be.
 */
function ConfiguratorSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] lg:gap-7">
      <div className="space-y-3">
        <Skeleton className="aspect-[4/3] w-full" rounded="rounded-xl sm:rounded-2xl" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="space-y-4">
        <Card className="space-y-3 p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-48" />
          <SkeletonText lines={2} />
        </Card>
        <Card className="space-y-3 p-4">
          <SkeletonText lines={3} />
        </Card>
      </div>
      <p className="sr-only">Loading your design.</p>
    </div>
  );
}
