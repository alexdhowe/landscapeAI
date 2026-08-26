"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PlantOption } from "@/lib/catalog/plants";
import { plantOptionsForRegion } from "@/lib/catalog/plants";
import { effectiveOutline } from "@/lib/design/outline";
import { renderModeForProject } from "@/lib/design/render";
import type { DesignProject, RegionSelection } from "@/lib/design/types";
import type { NormalizedPoint } from "@/lib/vision/types";
import type { MarketContext } from "@/lib/pricing/typology";

import { Badge } from "@/components/ui/Badge";
import { Callout, Card } from "@/components/ui/Card";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

import { CatalogPicker } from "./CatalogPicker";
import { PhotoCanvas, RegionStrip } from "./PhotoCanvas";
import { OutlineControls } from "./OutlineControls";
import { PlantMoveControls } from "./PlantMoveControls";
import { PlantPicker, PlantStrip } from "./PlantPicker";
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
/**
 * How often the design page asks what the segmentation is doing.
 *
 * Every two and a half seconds for up to three minutes is at most ~70
 * reads against a budget of 120 a minute (lib/ratelimit/policy.ts), and
 * it is what makes the stage transition in the middle of the wait
 * visible. It stops the moment there is an answer.
 */
const POLL_MS = 2_500;

/**
 * How long a pending segmentation is believed to be alive.
 *
 * Long enough to cover the slowest wait anybody has measured with room to
 * spare, short enough that a server that died mid-call does not leave the
 * customer watching a bar for a request nobody is running. Past it, this
 * tab starts the call itself.
 */
const RUNNING_FOR_MS = 6 * 60_000;

/** Is somebody already running this photo through the vision call? */
function alreadyRunning(project: DesignProject): boolean {
  const seg = project.segmentation;
  if (seg.status !== "pending" || !seg.progress) return false;
  const startedAt = Date.parse(seg.progress.startedAt);
  return Number.isFinite(startedAt) && Date.now() - startedAt < RUNNING_FOR_MS;
}

export function Configurator({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<DesignProject | null>(null);
  const [band, setBand] = useState<BandPayload | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedPlantingId, setSelectedPlantingId] = useState<string | null>(null);
  const [plantCatalog, setPlantCatalog] = useState<PlantOption[]>([]);
  /**
   * Whether this contractor's book can price taking a plant out. Served
   * beside the catalog and for the same reason: what is offerable is
   * whatever the current published revision can price.
   */
  const [canRemovePlants, setCanRemovePlants] = useState(false);
  /** …and whether it can price moving one. */
  const [canMovePlants, setCanMovePlants] = useState(false);
  const [adjustingRegionId, setAdjustingRegionId] = useState<string | null>(null);
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

  // What this contractor can plant. Fetched rather than bundled: the price
  // book is editable and revisioned, so the offerable list belongs to the
  // server. A failure here costs the plant picker and nothing else.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/plants").catch(() => null);
      if (!res?.ok || cancelled) return;
      const body = (await res.json()) as {
        plants: PlantOption[];
        canRemove?: boolean;
        canMove?: boolean;
      };
      if (cancelled) return;
      setPlantCatalog(body.plants ?? []);
      setCanRemovePlants(Boolean(body.canRemove));
      setCanMovePlants(Boolean(body.canMove));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the project; kick off segmentation if it hasn't run yet, and
  // watch it while it runs.
  //
  // The watching is the new part and it is what the progress bar is made
  // of. The POST below stays open for the whole 55-170 seconds and
  // answers once, at the end; the stage transition in the middle — the
  // first pass landing, with the names it found — reaches the page only
  // because this polls for it. POLL_MS against the READ budget (120 a
  // minute) is two orders of magnitude inside it.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const watch = () => {
      timer = setTimeout(async () => {
        const res = await fetch(`/api/projects/${projectId}`).catch(() => null);
        if (cancelled || !res?.ok) return;
        const latest = (await res.json()) as DesignProject;
        if (cancelled) return;
        // A poll may never overwrite an answer. The POST is the
        // authority on the finished segmentation and can land first.
        setProject((current) =>
          current && current.segmentation.status !== "pending" ? current : latest,
        );
        if (latest.segmentation.status === "pending") watch();
        // A tab that only watched — a reload, a second tab — still has to
        // pick the band up when the answer lands, because it never went
        // through the POST that used to be the only path to it.
        else void refreshBand();
      }, POLL_MS);
    };

    (async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) {
        if (!cancelled) setError("This design could not be found.");
        return;
      }
      const loaded = (await res.json()) as DesignProject;
      if (cancelled) return;
      setProject(loaded);

      if (loaded.segmentation.status === "pending") {
        watch();
        // A reload during a two-minute wait is exactly what an impatient
        // customer does, and it used to buy a second vision call: a
        // second metered request against the same photo, for an answer
        // the first one was already producing. A segmentation that has
        // recently reported progress is running somewhere, so this tab
        // watches rather than starts one.
        if (!alreadyRunning(loaded) && !segmentationStarted.current) {
          segmentationStarted.current = true;
          const visionRes = await fetch("/api/vision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId }),
          });
          if (cancelled) return;
          if (visionRes.ok || visionRes.status === 502) {
            setProject((await visionRes.json()) as DesignProject);
          } else {
            setError("We couldn't analyze this photo. Try another one.");
          }
        }
      }
      void refreshBand();
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
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

  const applyPlant = useCallback(
    async (plantingId: string, plantOptionId: string | null) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plantingId, plantOptionId }),
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

  const applyClear = useCallback(
    async (plantingIds: string[], cleared: boolean) => {
      if (plantingIds.length === 0) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clearPlantings: plantingIds, cleared }),
        });
        if (res.ok) {
          setProject((await res.json()) as DesignProject);
          // Taking plants out is priced — one `shrub_removal` each — so
          // the band has to move with it, the same as any other choice.
          await refreshBand();
        }
      } finally {
        setBusy(false);
      }
    },
    [projectId, refreshBand],
  );

  const applyPlantPosition = useCallback(
    async (plantingId: string, point: NormalizedPoint | null) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plantingId, plantAt: point }),
        });
        if (res.ok) {
          setProject((await res.json()) as DesignProject);
          // Moving a plant is crew time — one transplant each — so the
          // band moves with it.
          await refreshBand();
        }
      } finally {
        setBusy(false);
      }
    },
    [projectId, refreshBand],
  );

  const applyOutline = useCallback(
    async (regionId: string, polygon: NormalizedPoint[] | null) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regionId, polygon }),
        });
        if (res.ok) setProject((await res.json()) as DesignProject);
      } finally {
        setBusy(false);
      }
    },
    [projectId],
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
  const revealPicker = useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() =>
        pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      );
    }
  }, []);

  const selectRegion = useCallback(
    (regionId: string) => {
      setSelectedRegionId(regionId);
      setSelectedPlantingId(null);
      // Adjusting is per region and one at a time; moving to another area
      // is leaving the one you were adjusting.
      setAdjustingRegionId((current) => (current === regionId ? current : null));
      revealPicker();
    },
    [revealPicker],
  );

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
  const demo = seg.status === "ready" && seg.source === "demo";
  const openPlanting = selectedPlantingId
    ? regions
        .flatMap((region) =>
          (region.plantings ?? []).map((plant) => ({ region, plant })),
        )
        .find(({ plant }) => plant.id === selectedPlantingId)
    : undefined;

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
          // What is actually true when segmentation fails: there are no
          // regions, so there is nothing to tap, nothing to swap, no band
          // and nothing to send. Saying "carry on anyway" would be kinder
          // and wrong — the customer would go looking for a control that
          // is not there. So this says the one thing that does work, and
          // what makes it likelier to work next time.
          <Callout tone="clay" title="We couldn't read that photo" role="alert">
            <p className="mt-0.5">{seg.error}</p>
            <p className="mt-2">
              Another photo is the fix, and the shot matters more than the
              camera: stand back on the driveway or the front walk, hold the
              phone level, and get the whole area in frame in daylight.
            </p>
            <a
              href="/start"
              className="mt-2 inline-flex min-h-11 items-center font-medium underline underline-offset-4"
            >
              Try another photo
            </a>
          </Callout>
        )}

        {/* The picture and the row of areas in it are one object, so they
            sit closer to each other than to anything else on the page. */}
        <div className="space-y-2">
          <PhotoCanvas
            photoUrl={`/api/projects/${project.id}/photo`}
            regions={regions}
            selections={project.selections}
            selectedRegionId={selectedRegionId}
            onSelectRegion={selectRegion}
            pending={seg.status === "pending"}
            progress={seg.status === "pending" ? seg.progress : undefined}
            notice={demo ? "Example areas" : undefined}
            plantSelections={project.plantSelections}
            clearedPlantings={project.clearedPlantings}
            plantPositions={project.plantPositions}
            onMovePlant={
              locked || !canMovePlants
                ? undefined
                : (plantingId, point) => void applyPlantPosition(plantingId, point)
            }
            plantCatalog={plantCatalog}
            selectedPlantingId={selectedPlantingId}
            regionOutlines={project.regionOutlines}
            adjustingRegionId={locked ? null : adjustingRegionId}
            onAdjustOutline={(regionId, polygon) => void applyOutline(regionId, polygon)}
            onSelectPlanting={
              locked
                ? undefined
                : (plantingId, regionId) => {
                    setSelectedRegionId(regionId);
                    setSelectedPlantingId(plantingId);
                    revealPicker();
                  }
            }
          />

          {regions.length > 0 && (
            <RegionStrip
              regions={regions}
              selections={project.selections}
              selectedRegionId={selectedRegionId}
              onSelectRegion={selectRegion}
            />
          )}

          {demo && (
            // §1: the demo overlay may never ship unlabelled. It is
            // labelled twice — a pill on the picture and this line under
            // it — and neither of them asks a homeowner to set an
            // environment variable. The person who can do that is reading
            // the terminal, which already says so; in development the name
            // is here too, because then they are the same person.
            <p className="text-xs text-flag-900">
              <strong className="font-semibold">Those outlines are an example.</strong>{" "}
              We couldn&apos;t read your own photo this time, so we&apos;ve marked up a
              typical front yard instead. Everything else here is real: pick a
              material, watch the range move, send it to the contractor.
              {process.env.NODE_ENV !== "production" && (
                <span className="text-bark-600">
                  {" "}
                  (Dev: no usable{" "}
                  <code className="font-mono">ANTHROPIC_API_KEY</code>. The
                  terminal says which of the ways it can be wrong this is, and{" "}
                  <code className="font-mono">npm run doctor</code> checks all
                  of them.)
                </span>
              )}
            </p>
          )}
        </div>

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
          {!locked && (openPlanting || selectedRegion) ? (
            <Card className="p-4">
              {openPlanting ? (
                <PlantPicker
                  region={openPlanting.region}
                  planting={openPlanting.plant}
                  options={plantOptionsForRegion(plantCatalog, openPlanting.region.kind)}
                  chosenOptionId={project.plantSelections?.[openPlanting.plant.id]}
                  busy={busy}
                  canRemove={canRemovePlants}
                  onChoose={(optionId) => applyPlant(openPlanting.plant.id, optionId)}
                  onClear={() => {
                    void applyClear([openPlanting.plant.id], true);
                    // The plant is gone from the picture, so the picker
                    // for it has nothing left to be about.
                    setSelectedPlantingId(null);
                  }}
                  onClose={() => setSelectedPlantingId(null)}
                />
              ) : selectedRegion ? (
                <>
                  <CatalogPicker
                    region={selectedRegion}
                    selection={project.selections[selectedRegion.id]}
                    busy={busy}
                    onChange={(selection) => applySelection(selectedRegion.id, selection)}
                    onClose={() => setSelectedRegionId(null)}
                  />
                  <OutlineControls
                    regionLabel={selectedRegion.label}
                    polygon={effectiveOutline(selectedRegion, project.regionOutlines)}
                    adjusted={Boolean(project.regionOutlines?.[selectedRegion.id])}
                    busy={busy}
                    editing={adjustingRegionId === selectedRegion.id}
                    onToggleEditing={() =>
                      setAdjustingRegionId((current) =>
                        current === selectedRegion.id ? null : selectedRegion.id,
                      )
                    }
                    onChange={(polygon) => void applyOutline(selectedRegion.id, polygon)}
                    onReset={() => void applyOutline(selectedRegion.id, null)}
                  />
                  {canMovePlants && (
                    <PlantMoveControls
                      region={selectedRegion}
                      plantPositions={project.plantPositions}
                      selectedPlanting={
                        (selectedRegion.plantings ?? []).find(
                          (plant) => plant.id === selectedPlantingId,
                        ) ?? null
                      }
                      busy={busy}
                      onMove={(plantingId, point) =>
                        void applyPlantPosition(plantingId, point)
                      }
                      onPutBack={(plantingId) =>
                        void applyPlantPosition(plantingId, null)
                      }
                    />
                  )}
                </>
              ) : null}

              {/* Under whichever picker is open, so moving from one plant
                  to its neighbour does not mean going back out to the
                  photo first. This is also the accessible path to the
                  plants: the ellipses on the picture are hidden from
                  assistive technology. */}
              <PlantStrip
                region={openPlanting?.region ?? selectedRegion!}
                plantSelections={project.plantSelections}
                clearedPlantings={project.clearedPlantings}
                catalog={plantCatalog}
                canRemove={canRemovePlants}
                busy={busy}
                selectedPlantingId={selectedPlantingId}
                onClear={(plantingIds, cleared) => void applyClear(plantingIds, cleared)}
                onSelectPlanting={(plantingId) =>
                  setSelectedPlantingId(
                    plantingId === selectedPlantingId ? null : plantingId,
                  )
                }
              />
            </Card>
          ) : null}
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
