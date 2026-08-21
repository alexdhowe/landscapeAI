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
| 3.5 — Time slider | ✅ done — growth curves, spacing validation, year 1/3/5 |
| 4 — Reconciliation | ✅ done — photo/aerial arbitration, disagreement flags |
| 5 — Lead capture / dashboard | ✅ done — immutable snapshot, contractor inbox |
| 6 — Confirmation gate | ✅ done — rep corrections, deltas, final quote |
| Persistence — Postgres + Drizzle | ✅ done — migrations, `lib/db/queries.ts`, deltas are a table |

All six phases are in, and they run on Postgres. `npm test` runs 181 tests —
with a database and without one.

Still open from sections 3 and 4, each its own session: `/pricebook`,
`/api/imagery`, photo object storage, and contractor auth.

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind. Drizzle against Postgres —
schema in `lib/db/schema.ts`, migrations in `drizzle/`, every query in
`lib/db/queries.ts`. With no `DATABASE_URL` the app falls back to the file
store, so a clean checkout runs the demo with nothing to provision.

## Commands

```sh
npm test          # Vitest — 181 tests across every phase
npm run typecheck
npm run dev
npm run build

npm run db:generate   # regenerate migrations from lib/db/schema.ts
npm run db:migrate    # apply them
npm run db:seed       # load the org's price book from seed/pricebook.seed.ts
npm run db:setup      # migrate + seed
```

See `.env.example` for what is configurable. All of it is optional.

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
- Projects live behind `lib/store/projects.ts` — the only module that knows
  storage. See [the database](#the-database) below.

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

## The time slider (Phase 3.5)

`lib/growth/` turns plant metadata into a rendering parameter. `curve.ts`
holds the per-growth-rate-class approach to mature size (sigmoid, from
published nursery figures — not a botany simulator); `spacing.ts` compares
placed spacing against mature spread and flags crowding at year 5 with a
corrected count. Bed geometry, hardscape, and house are identical across
year 1/3/5 — only plant scale changes. Demo at `/design/demo`.

## Reconciliation — the second sensor (Phase 4)

`lib/measure/reconcile.ts` arbitrates, it does not average: aerial wins
horizontal area, the photo wins material identity, condition, and anything
vertical. Agreement inside 15% tightens the disclosure band (×0.6);
disagreement beyond 25% flags for review and widens it (×1.5). The photo's
`estimatedAreaSf` exists only as this QA signal — it is never priced.

## Lead capture and the dashboard (Phase 5)

Submitting freezes an `EstimateSnapshot`: the customer-facing payload is
serialized once and stored as that exact string, and every surface serves
those bytes verbatim, so byte-identity holds by construction. `lib/design/quote.ts`
is the single quote computation behind both `/api/price` and the freeze,
so the two cannot drift. `/dashboard` is the lead inbox; `/leads/[id]` shows
the design, quantities with provenance badges, confidence per region,
reconciliation verdicts, and the internal estimate — internal pricing
renders only on contractor surfaces.

## The confirmation gate (Phase 6)

A rep visits the site, measures for real, and corrects the quantities the
customer was priced on. Every correction is a `MeasurementDelta` — the
estimate that was wrong, the confirmed truth that replaced it, and the
provenance of each. Nothing overwrites anything.

- `lib/confirm/deltas.ts` — the correction primitive and the only place a
  `rep_confirmed` quantity is minted. The new quantity carries
  `supersedes` pointing at the one it replaced; quantities created before
  a correction existed (a drawn ring, a typology percentile) carry no id,
  so they are identified at the moment they are superseded and that
  identified copy is stored in the delta. The delta is self-contained: the
  lineage resolves from the record alone.
- `lib/confirm/quantities.ts` — the sensor hierarchy, closest observation
  first: `rep_confirmed` › `user_drawn` › `typology`. Confirming a
  typology quantity is supported and is the most valuable delta of all —
  it is how the opening band learns.
- `lib/confirm/quote.ts` — the final quote, priced from confirmed
  quantities and disclosed as a **figure, not a band** (`wiFinalQuotePolicy`).
  The band expressed uncertainty about quantities nobody had measured;
  the site visit is what removes it.
- `lib/confirm/analytics.ts` — mean, median, and P90 error by job type, by
  provenance of the corrected estimate, and by dimension. Bias (signed) is
  reported separately from magnitude (absolute), because a fleet that
  misses by ±20% every time has a mean signed error of zero. Rendered at
  `/deltas`.

**What is immutable stays immutable.** The final quote is a *new*
`EstimateSnapshot` (`kind: 'rep_confirmed'`) appended beside the
customer's original. `GET /api/projects/[id]/snapshot` keeps serving the
submitted bytes forever; the final quote lives at
`GET /api/projects/[id]/quote`. The acceptance test drives the map's
scenario through the real routes: a bed corrected 400 → 470 SF, the delta
queryable, the quote priced at 470, the customer's snapshot still 400.

Project lifecycle: `playing` → `submitted` → `confirmed` → `quoted`.
A quote is final — revising one would be a new revision, which the MVP
does not model. Corrections cover region **area (SF) and edge run (LF)**;
EA counts (plant quantities) stay typology-scaled, since they are
per-assembly rather than per-region and need a line-item editor.

## The database

Postgres via Drizzle, per project-map section 3. `DATABASE_URL` is the
switch: set it and `lib/store/projects.ts` runs on the database; leave it
unset and the same exports run on JSON files under `.data/`. Nothing above
the store knows which, and the acceptance suite runs against both.

```sh
export DATABASE_URL=postgres://…
npm run db:setup      # migrate, then seed the org
npm run dev
```

- `lib/db/schema.ts` — the tables, reconciled against what phases 5 and 6
  actually persist. Every quantity is JSONB and stored **whole**, so
  `source`, `confidence` and `supersedes` survive the round trip; there is
  no bare numeric column standing in for a measurement anywhere.
  `estimate_snapshots.customer_facing_payload` is **TEXT**, deliberately —
  a JSONB round trip would re-serialize the customer's bytes, and a
  re-serialized snapshot is not a snapshot.
- `lib/db/queries.ts` — every query, and the only place rows become domain
  objects.
- `lib/db/client.ts` — the only module that opens a connection.
- `drizzle/` — generated migrations, committed. `npm run db:generate` after
  a schema change.

**`measurement_deltas` is a table now.** The corpus was JSON inside project
files, and the query section 6 calls "the whole business" answered it by
reading every project on disk. It is one indexed statement:

```sql
with errors as (
  select job_type,
         ((before_qty ->> 'value')::double precision
          - (after_qty  ->> 'value')::double precision)
         / (after_qty ->> 'value')::double precision * 100 as error_pct
  from measurement_deltas
)
select job_type,
       count(*),
       round(avg(error_pct)::numeric, 1)                     as mean_error_pct,
       round(avg(abs(error_pct))::numeric, 1)                as mean_abs_error_pct,
       round((percentile_disc(0.9)
              within group (order by abs(error_pct)))::numeric, 1) as p90_abs_error_pct
from errors
group by job_type;
```

Same numbers `/deltas` renders (`lib/confirm/analytics.ts`); a test asserts
the two agree to the digit. `percentile_disc` is nearest-rank, matching the
analytics module's deliberate refusal to interpolate a percentile out of a
contractor's double-digit sample.

**Organization is real.** Section 5 makes it the contractor tenant that owns
the price book, and it does: cost items, assemblies, margin config, both
disclosure policies, and the bid distributions behind the opening band are
per-org rows. Routes call `resolveOrg()` instead of importing constants.
`seed/pricebook.seed.ts` is unchanged in what it holds and changed in what
it is — seed input (`npm run db:seed`) rather than a runtime import. Without
a database `resolveOrg()` reads it directly, which is what keeps the
no-database demo honest rather than a different product. One org for now.

`lib/pricing` still imports none of this. A test reads its source and fails
if a `lib/db`, `lib/store`, drizzle, `next`, `react` or `fetch` import ever
appears there — the engine takes a price book as an argument, as it always
has.

### Tests need no server

`npm test` runs the whole suite twice over, in effect:

- With no `DATABASE_URL`, the store tests use throwaway temp directories and
  the database acceptance test brings up **PGlite** — Postgres compiled to
  wasm, in-process, disposable.
- With `DATABASE_URL` set, the entire suite runs against that server inside a
  **disposable schema** created and dropped per run
  (`vitest.globalSetup.ts`), so a run never touches your data.

Either way `lib/db/__tests__/store.test.ts` drives the phase 5 and phase 6
acceptance paths through the real route handlers — submit a lead, correct a
bed 400 → 470 SF, issue the final quote — and asserts the customer's frozen
bytes come back byte-identical after a database round trip.

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

With a database, that file is **seed input**: `npm run db:seed` writes it
onto the org and the routes read the rows, so a contractor editing their
price book edits data rather than source. Re-seeding never overwrites an
existing org, precisely because it may have been edited since.

Current WI-average opening bands (sell price):

| Job type | Residential | HOA / commercial |
|---|---|---|
| Mulch-to-stone conversion | $1,600 – $5,900 | $6,300 – $26,000 |
| Bed renovation | $2,700 – $8,200 | $10,300 – $39,500 |
| Foundation planting refresh | $1,200 – $3,300 | $3,500 – $12,600 |
