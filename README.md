# LandscapeAI

Design-to-estimate MVP for landscape contractors. A homeowner uploads a photo,
plays with their yard, sees a budget band; the aerial pass measures the real
property and narrows it; a rep confirms on site and every correction is logged.

The full build plan lives in [`project-map.md`](./project-map.md). Read it
before touching anything — section 1 lists architectural invariants that are
not negotiable.

## Status

| Phase | State |
|---|---|
| 1 — Pricing engine (`lib/pricing`) | ✅ done — 16 golden tests passing |
| 1.5 — Typology bands | ✅ done — WI-average seed data, 8 tests passing |
| 2 — Photo experience | ✅ done — upload → segmentation → click-to-swap → band |
| 3 — Aerial measurement | ✅ done — address → aerial → draw → band narrows |
| 3.5 — Time slider | not started |
| 4 — Reconciliation | not started |
| 5 — Lead capture / dashboard | not started |
| 6 — Confirmation gate | not started |

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind. Drizzle against Postgres
(schema scaffolded in `lib/db/schema.ts`, no migrations run yet — Phase 1 is
pure logic with no DB).

## Commands

```sh
npm test          # Vitest — the Phase 1 golden tests
npm run typecheck
npm run dev
npm run build
```

## The photo experience (Phase 2)

`/start` uploads a yard photo (no address, no form) and lands on
`/design/[projectId]`: the photo with labeled region polygons, a catalog
picker filtered to the clicked region's kind, and a budget band that reads
"projects like this typically run $X–$Y".

- `lib/vision/` — Claude vision segmentation (`classify.ts`, model
  `claude-opus-5`) with a pure, unit-tested response parser (`parse.ts`).
  Without `ANTHROPIC_API_KEY` the app falls back to a deterministic demo
  overlay, clearly labeled as such in the UI.
- `lib/catalog/options.ts` — the click-to-swap catalog. Every option maps
  to assemblies/SKUs that exist in the seed price book; a test enforces it
  (the catalog is the guardrail — nothing can be offered that can't be
  priced).
- `lib/design/band.ts` — selections → implied job type → the Phase 1.5
  typology band. Pure; runs only server-side in `/api/price`, which returns
  band endpoints and scope labels — never line items, rates, or margin.
- Visual swap is deterministic: the region polygon fills with an SVG
  material pattern generated from the selection. The image stays a view of
  the object graph, never the artifact.
- Projects live in a file-backed store under `.data/` (gitignored) behind
  `lib/store/projects.ts` — the only module that knows storage; Postgres
  replaces it at the lead-capture phase without touching the UI.

## The aerial measurement layer (Phase 3)

From the design page, "Add your address" leads to
`/design/[projectId]/locate`: geocode → MapLibre over satellite raster
centered on the pin → Terra Draw polygons per photo region (auto-suggested
starter shapes, fully adjustable) → Turf geodesic area and perimeter →
the band **visibly narrows** from the typology P25–P75 spread to the
engine run on real quantities, projected through the disclosure policy
(an animated meter shows the old range collapsing to the new one).

- `lib/measure/area.ts` — the measurement engine: pure Turf wrappers
  turning drawn rings into provenance-carrying `Quantity` values
  (`source: 'user_drawn'`; `'aerial'` stays reserved for machine-detected
  geometry in Phase 4+). A golden test confirms a known 100×50 ft
  rectangle measures to within 2%.
- `lib/design/measured.ts` — measured quantities → `buildEstimate` →
  `applyDisclosure` → the narrowed band. SF assemblies take drawn area,
  LF assemblies take drawn perimeter; EA counts (plants) scale from
  typology density and stay labeled `typology` with reduced confidence,
  because a count was never measured. Unmeasured designed regions fall
  back to typology P50s so a partly measured design prices as one whole.
- `lib/geo/geocode.ts` — Nominatim for the MVP with a clearly-labeled
  demo pin fallback (`GEOCODER=demo` forces it). Production needs a
  licensed geocoder — see project-map §3.
- The customer who declines an address keeps their design and typology
  band (`addressDeclined` on the project); the lead is still capturable
  in Phase 5.
- Satellite tiles default to Esri World Imagery for the demo; override
  with `NEXT_PUBLIC_SATELLITE_TILE_URL` / `NEXT_PUBLIC_SATELLITE_ATTRIBUTION`.
  **Before production**: derivative-measurement licensing (Nearmap/Vexcel)
  is the real decision — see project-map §3.

## The pricing engine

`lib/pricing` is pure TypeScript: no imports from `app/`, `lib/db/`, or
anything that does I/O.

- `types.ts` — `Quantity` (provenance-carrying, never a bare number),
  `CostItem`, `Assembly`, `MarginConfig`, `DisclosurePolicy`
- `assemblies.ts` — assembly rollup: waste factor on material quantity,
  burden on labor cost, production-rate → hours conversion
- `engine.ts` — `buildEstimate`: contingency, margin-on-price with a floor
  clamp, internal estimate
- `disclosure.ts` — `applyDisclosure`: the only path from an internal
  estimate to a customer surface (band / Good-Better-Best tiers / figure);
  never leaks unit rates, costs, or margin
- `typology.ts` — `getTypologyBand(jobType, context, config)`: P25/P75 of
  the historical quantity distributions run through the engine → the
  opening band shown before anything is measured

## Seed data — Wisconsin averages, pending real bids

Real contractor bid data is not available yet, so `seed/pricebook.seed.ts`
carries **Wisconsin state-average placeholders** (sources cited in the file
header): ~45 SKUs including 26 zone-4/5 plants with full metadata (install
size, mature height/spread, growth rate class, form, hardiness, foliage),
costed assemblies, burden/margin defaults, and *estimated* P25/P50/P75
quantity distributions per job type. Everything is centralized in that one
file — when real bids arrive, replace its contents and keep the exported
names; the typology tests validate structure and self-consistency rather
than pinned dollar values, so they survive the swap.

Current WI-average opening bands (sell price):

| Job type | Residential | HOA / commercial |
|---|---|---|
| Mulch-to-stone conversion | $1,600 – $5,900 | $6,300 – $26,000 |
| Bed renovation | $2,700 – $8,200 | $10,300 – $39,500 |
| Foundation planting refresh | $1,200 – $3,300 | $3,500 – $12,600 |
