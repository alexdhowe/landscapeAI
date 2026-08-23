"use client";

/**
 * Phase 3.5 — the time slider.
 *
 * Plan view of a fixed sample design. The house, walkway, and bed path are
 * rendered from static constants and are pixel-identical at every year —
 * the slider only changes plant scale (and the tree's staged asset), which
 * is the acceptance criterion for this phase.
 */
import { useMemo, useState } from "react";
import {
  renderSpec,
  sizeAtYear,
  validateSpacing,
  type CrowdingWarning,
  type PlantPlacement,
} from "../../lib/growth";
import { plantMetaBySku, plantSkus } from "../../seed/pricebook.seed";
import {
  BED_PATH,
  HOUSE,
  SCENE,
  WALKWAY,
  placements,
  skuStyles,
} from "./sampleDesign";

const nameBySku: Record<string, string> = Object.fromEntries(
  plantSkus.map((p) => [p.id, p.name]),
);

/** 1.5 → 1′6″ */
function ftIn(ft: number): string {
  const whole = Math.floor(ft);
  const inches = Math.round((ft - whole) * 12);
  if (inches === 0) return `${whole}′`;
  if (inches === 12) return `${whole + 1}′`;
  return `${whole}′${inches}″`;
}

function crowdedIds(warnings: CrowdingWarning[]): Set<string> {
  return new Set(warnings.flatMap((w) => [w.aId, w.bId]));
}

function TreeGlyph({
  placement,
  year,
}: {
  placement: PlantPlacement;
  year: number;
}) {
  const meta = plantMetaBySku[placement.skuId];
  const spec = renderSpec(placement.skuId, meta, year);
  const size = sizeAtYear(meta, year);
  const r = size.spreadFt / 2;
  const style = skuStyles[placement.skuId];
  const state = spec.kind === "staged" ? spec.state : "mature";
  return (
    <g>
      {/* crown — the staged asset: juvenile is open and sparse, not a shrunken mature crown */}
      <circle
        cx={placement.xFt}
        cy={placement.yFt}
        r={r}
        fill={style.fill}
        fillOpacity={state === "juvenile" ? 0.35 : state === "semi_mature" ? 0.55 : 0.75}
        stroke={style.stroke}
        strokeWidth={0.12}
        strokeDasharray={state === "juvenile" ? "0.5 0.35" : undefined}
        style={{ transition: "r 250ms ease" }}
      />
      {state === "mature" && (
        <circle
          cx={placement.xFt}
          cy={placement.yFt}
          r={r * 0.55}
          fill={style.stroke}
          fillOpacity={0.25}
          style={{ transition: "r 250ms ease" }}
        />
      )}
      {/* trunk */}
      <circle cx={placement.xFt} cy={placement.yFt} r={0.35} fill="#6b4f2a" />
    </g>
  );
}

export default function TimeSliderDemo() {
  const [year, setYear] = useState(1);

  // The map's rule: crowding is judged at year 5, against mature spread.
  const report = useMemo(
    () => validateSpacing(placements, plantMetaBySku),
    [],
  );
  // Live view: which canopies actually collide at the year on screen.
  const liveCrowded = useMemo(
    () =>
      crowdedIds(
        validateSpacing(placements, plantMetaBySku, { evaluationYear: year })
          .warnings,
      ),
    [year],
  );

  const tree = placements.find(
    (p) => plantMetaBySku[p.skuId]?.category === "tree",
  )!;
  const treeSpec = renderSpec(tree.skuId, plantMetaBySku[tree.skuId], year);
  const shrubs = placements.filter((p) => p.id !== tree.id);
  // large canopies first so small plants stay clickable/visible on top
  const drawOrder = [...shrubs].sort(
    (a, b) =>
      sizeAtYear(plantMetaBySku[b.skuId], year).spreadFt -
      sizeAtYear(plantMetaBySku[a.skuId], year).spreadFt,
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <svg
          viewBox={`0 0 ${SCENE.widthFt} ${SCENE.heightFt}`}
          className="w-full rounded-lg border border-bark-200 bg-white"
          role="img"
          aria-label={`Plan view of the sample design at year ${year}`}
        >
          {/* ------- static layers: identical at every year ------- */}
          <rect x={0} y={0} width={SCENE.widthFt} height={SCENE.heightFt} fill="#e7efdb" />
          <path d={BED_PATH} fill="#c9a97a" stroke="#a9905f" strokeWidth={0.15} />
          <rect
            x={WALKWAY.x} y={WALKWAY.y} width={WALKWAY.w} height={WALKWAY.h}
            fill="#d9d4cb" stroke="#b8b2a6" strokeWidth={0.15}
          />
          <rect
            x={HOUSE.x} y={HOUSE.y} width={HOUSE.w} height={HOUSE.h}
            fill="#efe9e0" stroke="#b8ab99" strokeWidth={0.2}
          />
          <text x={HOUSE.x + HOUSE.w / 2} y={HOUSE.y + HOUSE.h / 2 + 0.6}
            textAnchor="middle" fontSize={1.8} fill="#8f8272">house</text>
          <text x={WALKWAY.x + WALKWAY.w / 2} y={36} textAnchor="middle"
            fontSize={1.3} fill="#8f8272" transform={`rotate(-90 ${WALKWAY.x + WALKWAY.w / 2} 36)`}>walk</text>

          {/* ------- plants: the only layer the slider touches ------- */}
          {drawOrder.map((p) => {
            const meta = plantMetaBySku[p.skuId];
            const size = sizeAtYear(meta, year);
            const style = skuStyles[p.skuId];
            const crowded = liveCrowded.has(p.id);
            return (
              <circle
                key={p.id}
                cx={p.xFt}
                cy={p.yFt}
                r={size.spreadFt / 2}
                fill={style.fill}
                fillOpacity={0.75}
                stroke={crowded ? "#c0392b" : style.stroke}
                strokeWidth={crowded ? 0.25 : 0.12}
                style={{ transition: "r 250ms ease" }}
              />
            );
          })}
          <TreeGlyph placement={tree} year={year} />
        </svg>
        <p className="mt-2 text-xs text-bark-500">
          Plan view, 60′ × 40′. Bed, walkway, and house are static — drag the
          slider and only the plants change. Red rings mark canopies that have
          collided by the year shown.
        </p>
      </div>

      <div className="w-full shrink-0 space-y-5 lg:w-80">
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="year" className="text-sm font-medium text-bark-700">
              Years after planting
            </label>
            <span className="text-2xl font-semibold tabular-nums text-bark-900">
              {year}
            </span>
          </div>
          <input
            id="year"
            type="range"
            min={1}
            max={15}
            step={1}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            // h-11 so the track is a 44px drag target on a phone; the
            // thumb itself is drawn by the platform.
            className="mt-2 h-11 w-full accent-canopy-700"
          />
          <div className="mt-1 flex gap-2">
            {[1, 3, 5].map((y) => (
              <button
                key={y}
                type="button"
                aria-pressed={year === y}
                onClick={() => setYear(y)}
                className={`min-h-11 rounded-lg border px-3.5 text-sm font-medium transition-colors ${
                  year === y
                    ? "border-canopy-700 bg-canopy-700 text-white"
                    : "border-bark-300 text-bark-700 hover:bg-bark-100"
                }`}
              >
                Year {y}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-bark-200 p-3 text-sm">
          <p className="font-medium text-bark-800">
            {nameBySku[tree.skuId]}
          </p>
          <p className="mt-1 text-bark-600">
            {ftIn(sizeAtYear(plantMetaBySku[tree.skuId], year).heightFt)} tall ·{" "}
            {ftIn(sizeAtYear(plantMetaBySku[tree.skuId], year).spreadFt)} spread ·{" "}
            <span className="text-bark-500">
              {treeSpec.kind === "staged"
                ? treeSpec.state.replace("_", "-")
                : "scaled"}{" "}
              asset
            </span>
          </p>
        </div>

        {report.warnings.length > 0 && (
          <div className="rounded-lg border border-clay-200 bg-clay-50 p-3 text-sm">
            <p className="font-medium text-clay-800">
              Crowding by year {report.evaluationYear}
            </p>
            {report.corrections.map((c) => (
              <p key={c.skuId} className="mt-2 text-clay-900">
                {c.currentCount} × {nameBySku[c.skuId]} on a{" "}
                {ftIn(c.rowLengthFt)} run crowd out (mature spread{" "}
                {ftIn(plantMetaBySku[c.skuId].matureSpreadFt)}). Suggest{" "}
                <span className="font-semibold">
                  {c.correctedCount} at {ftIn(c.correctedSpacingFt)} centers
                </span>
                .
              </p>
            ))}
            <p className="mt-2 text-xs text-clay-700">
              {report.warnings.length} colliding pair
              {report.warnings.length === 1 ? "" : "s"} at year{" "}
              {report.evaluationYear}.
            </p>
          </div>
        )}

        <p className="text-xs text-bark-500">
          Year 1 renders true to install size — sparse is honest. Setting that
          expectation before the sale is the cheapest callback prevention
          available.
        </p>
      </div>
    </div>
  );
}
