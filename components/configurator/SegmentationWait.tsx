"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { readableRemaining, waitView } from "@/lib/design/wait";
import type { SegmentationProgress } from "@/lib/design/types";
import { estimateSegmentation } from "@/lib/vision/estimate";

/**
 * The wait, over the customer's own photograph.
 *
 * ---------------------------------------------------------------------
 * What was wrong with the old one
 * ---------------------------------------------------------------------
 * A band of light travelling down the photo, three placeholder chips, and
 * the words "a few seconds". It was designed when nobody had timed the
 * vision call. The call takes 55–170 seconds. For two minutes that screen
 * says nothing about whether anything is happening, how far along it is,
 * or how much longer it will be — and the customer's only move, when they
 * cannot tell working from hung, is to reload or leave.
 *
 * ---------------------------------------------------------------------
 * What this says instead
 * ---------------------------------------------------------------------
 * Three things, and all three are true rather than decorative:
 *
 * - **Which pass is running.** The two vision passes are a real
 *   sequence — read the photo, then check every edge against it — and the
 *   server records the transition between them as it happens. A tick
 *   against "finding the areas" appears because the first pass finished,
 *   not because a timer said it should have.
 * - **What it found.** The first pass knows the region names about a
 *   minute before the outlines can be drawn. Putting them on screen turns
 *   the long half of the wait into a result arriving in instalments.
 * - **How much longer.** Sized from the photo's pixel count, then
 *   re-derived from the first pass's measured time the moment there is
 *   one. `lib/design/wait.ts` holds the rules that keep a wrong estimate
 *   from turning into a lie: the bar never claims a stage is done, never
 *   stalls, and the countdown stops predicting when it runs out.
 *
 * The band of light stays. It was the right idea — the customer's own
 * photograph, being read — and it is the part of this that is worth
 * looking at.
 */
export function SegmentationWait({
  progress,
  photoPixels,
}: {
  progress?: SegmentationProgress;
  /**
   * The stored photo's pixel count, from the image the page has already
   * loaded. Only used for the second or two before the server's own
   * estimate arrives, and for a project whose segmentation started before
   * any of this existed.
   */
  photoPixels?: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const startedAt = progress ? Date.parse(progress.startedAt) : NaN;
  // The server's clock is the right one — it is where the wait actually
  // started, and it survives a reload — but it is somebody else's clock.
  // A phone a minute out would otherwise show a countdown that starts
  // wrong or an elapsed time that is negative, so an implausible reading
  // falls back to how long this component has been on screen.
  const trustServerClock =
    Number.isFinite(startedAt) && startedAt <= now + 5_000 && now - startedAt < 1_800_000;
  const elapsedMs = Math.max(0, now - (trustServerClock ? startedAt : mountedAt.current));

  const estimate = useMemo(
    () =>
      progress?.estimate ??
      // The browser cannot know whether this deployment runs the second
      // pass; it is on by default and on everywhere it has ever run, so
      // assume it. The server's own estimate replaces this within a
      // second or two of the wait starting.
      estimateSegmentation(photoPixels ?? null, { refine: true }),
    [progress?.estimate, photoPixels],
  );

  const view = waitView({
    elapsedMs,
    stage: progress?.stage ?? "reading",
    estimate,
    firstPassMs: progress?.firstPassMs,
  });

  const found = progress?.found ?? [];
  const refining = view.stage === "refining";
  const percent = Math.round(view.fraction * 100);

  const remaining = view.overdue
    ? "Taking longer than usual"
    : view.remainingMs !== null
      ? `${readableRemaining(view.remainingMs)} left`
      : "Any moment now";

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-bark-950/45" />
      {/* The band of light. Decorative, and it stops moving for anyone who
          asked for reduced motion. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/3 animate-sweep bg-gradient-to-b from-transparent via-white/30 to-transparent"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bark-950/92 via-bark-950/60 to-transparent px-4 pb-4 pt-10 sm:px-5 sm:pb-5 sm:pt-16">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium text-white sm:text-base">
            {refining ? "Checking every edge against your photo…" : "Reading your photo…"}
          </p>
          <p className="text-xs tabular-nums text-canopy-200 sm:text-sm">{remaining}</p>
        </div>

        {/* The bar. `aria-valuetext` rather than a live region for the
            countdown: a polite region that changes every second talks
            over everything else a screen reader is trying to say. */}
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/25"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}% — ${remaining}`}
          aria-label="Reading your photo"
        >
          <div
            className="h-full rounded-full bg-canopy-300 transition-[width] duration-1000 ease-linear"
            style={{ width: `${percent}%` }}
          />
        </div>

        <ol className="mt-2.5 space-y-1 text-xs text-canopy-100 sm:mt-3 sm:space-y-1.5 sm:text-sm">
          <WaitStep done={refining} label="Finding the lawn, beds and hardscape" />
          <WaitStep
            done={false}
            waiting={!refining}
            label="Checking every edge against your photo"
          />
        </ol>

        {/* What the first pass found, a minute before the outlines can be
            drawn. Nothing stands in for it beforehand: a row of grey
            placeholder pills was the old wait's idea of substance, and
            the two lines above now carry that job with something true
            in them. */}
        {found.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
            {found.map((label) => (
              <span
                key={label}
                className="rounded-full bg-white/15 px-2.5 py-1 text-2xs font-medium text-white ring-1 ring-white/25 sm:text-xs"
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {view.overdue && (
          <p className="mt-3 text-xs text-flag-100 sm:text-sm">
            Still working. Big photos take longer — keep this page open and it
            will finish.
          </p>
        )}

        {/* The one thing worth announcing: a stage boundary. Everything
            else here changes every second. */}
        <p aria-live="polite" className="sr-only">
          {refining
            ? `Found ${found.length} area${found.length === 1 ? "" : "s"}. Now checking every edge against your photo.`
            : "Reading your photo."}
        </p>
      </div>
    </div>
  );
}

function WaitStep({
  done,
  waiting = false,
  label,
}: {
  done: boolean;
  waiting?: boolean;
  label: string;
}) {
  return (
    <li className={`flex items-center gap-2 ${done || !waiting ? "" : "text-canopy-100/55"}`}>
      <span
        aria-hidden
        className={`flex size-4 shrink-0 items-center justify-center rounded-full ${
          done ? "bg-canopy-300 text-bark-950" : waiting ? "bg-white/20" : "bg-white/35"
        }`}
      >
        {done ? (
          <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.4 4.8 8.8 9.5 3.4" />
          </svg>
        ) : null}
      </span>
      {label}
      {done ? <span className="sr-only"> — done</span> : null}
    </li>
  );
}
