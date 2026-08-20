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
| 1.5 — Typology bands | not started |
| 2 — Photo experience | not started |
| 3 — Aerial measurement | not started |
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

## Seed data still needed (section 7 of the map)

The fixture price book in `lib/pricing/__tests__/fixtures.ts` uses
**placeholder numbers**. The real ~40 SKUs, plant metadata, burden/overhead
percentages, 10 historical bids, and quantity distributions by job type must
come from the contractor before Phase 1.5 bands can be defended.
