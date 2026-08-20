# Project Map — Landscape Design-to-Estimate MVP

A build plan structured as sequential Claude Code sessions. Each phase has a
concrete acceptance test so you know when to stop and move on.

---

## 0. The one-paragraph spec

A homeowner or HOA board member uploads a photo of the area they want worked on.
Within seconds they see their own yard with regions labeled — lawn, beds,
hardscape, foundation planting. They click a region and swap what's in it (mulch
→ decorative stone, add shrubs, add a boulder), and a **budget band** appears
based on what projects like theirs typically cost. No address required, no form
to fill out — they're playing inside thirty seconds. Once they're invested, the
app asks for the address, pulls aerial imagery, measures the actual property,
and **narrows the band** to their specific yard. A time slider shows the same
design at year 1, 3, and 5 as the plants fill in. They submit as a lead. A
contractor rep reviews it, visits the site, corrects the quantities, and issues
the real quote. Every correction is logged.

---

## 1. Architectural invariants

Do not violate these. Everything else is negotiable.

**The image is a view, never the artifact.** The source of truth is an object
graph: regions with geometry, elements with SKUs. Any picture — map fill, photo
overlay, future render — is generated *from* that graph. If you ever find
yourself parsing a picture to get a quantity back out, you've inverted the
architecture.

**Every quantity carries provenance.** No bare numbers anywhere in the schema:

```ts
type Quantity = {
  value: number;
  unit: 'SF' | 'LF' | 'EA' | 'CY';
  source: 'aerial' | 'photo' | 'user_drawn' | 'rep_confirmed' | 'as_built';
  confidence: number;        // 0-1
  capturedAt: string;        // ISO
  supersedes?: string;       // id of the quantity this replaced
};
```

**The pricing engine is a pure function.** No database calls, no HTTP, no React.
It takes quantities + price book + config and returns line items. This is the
only part of the system that's genuinely yours, it's the part you can spec
better than anyone, and it must be unit-testable in isolation.

**Customer-facing price is a projection, not the estimate.** The internal
estimate has cost, burden, and margin. What the customer sees is the output of
a contractor-configurable disclosure policy applied to it. Never render internal
line items to a customer surface — that's the objection that kills every
contractor sales conversation.

**Estimates are immutable snapshots.** When a customer submits, freeze what they
saw. The rep's corrections create a *new* record. This protects you from the
anchoring problem and gives you the training corpus.

**Rendering has two modes, gated by confidence.** At the *play* stage — photo
uploaded, nothing measured yet — the price shown is a typology band, so
generative rendering is acceptable because you aren't making a quantity claim.
Once the aerial lands and you're showing quantity-derived numbers, rendering
must be deterministic. Never show a generated image next to a computed figure;
if the picture and the number can disagree, you lose the customer permanently.

**Generation is constrained to catalog SKUs.** Build every generative prompt
from catalog entries, never from free customer text. A customer who can conjure
something you don't stock and can't price has been sold something outside your
object model. The catalog is the guardrail, not a limitation.

---

## 2. Scope

### In
- Photo upload → region segmentation → click-to-swap configurator
- Typology bands from historical bid distributions (price before measurement)
- Address → aerial imagery → region drawing → geodesic area → band narrows
- Curated catalog (~40 SKUs) with costed assemblies
- Year 1/3/5 growth slider with maturity spacing validation
- Photo/aerial reconciliation with disagreement flagging
- Lead capture → contractor dashboard → immutable snapshot
- Rep confirmation flow with delta logging

### Explicitly out (v2+)
- Monocular depth estimation from the ground photo (research problem; the
  aerial leg alone closes the loop)
- Photoreal diffusion rendering
- Drone capture / CAD export
- 3D anything
- Native mobile
- Payments, scheduling, invoicing

---

## 3. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | One deployable, server actions for the pricing calls |
| Styling | Tailwind | Fast, and Claude Code writes it well |
| DB | Postgres (Neon or Supabase) | Needs PostGIS-ish geometry; JSONB is fine for MVP |
| ORM | Drizzle | Typed, migration-friendly, less magic than Prisma |
| Map | MapLibre GL JS | No vendor lock at the library layer |
| Drawing | Terra Draw | Modern polygon drawing, MapLibre-native |
| Geometry | Turf.js (`@turf/area`, `@turf/length`) | Geodesic area from GeoJSON — this *is* your measurement engine |
| Vision | Anthropic API (Claude, vision) | Material ID + element detection from the photo |
| Storage | S3-compatible (R2 / Supabase Storage) | Photos |
| Auth | Auth.js or Clerk | Contractor side only; customer side is anonymous + email |

### Decisions to make before Phase 2

**Imagery provider — this is the real one.** Check derivative-works terms
carefully before you build on anything. Some tile licenses prohibit deriving and
reselling measurements, which is exactly your product. Candidates: Mapbox
Satellite, Esri World Imagery, Nearmap, Vexcel. Nearmap/Vexcel license cleanly
and refresh more often but charge per property. Assume imagery is your dominant
COGS line, not inference.

**Geocoder.** Mapbox, Google, or Nominatim (check commercial terms). Watch
condo/HOA addresses — they geocode to a complex centroid, not a parcel.

---

## 4. Repo structure

```
/app
  /(customer)
    /start                     # photo upload — the entry point
    /design/[projectId]        # the configurator
    /design/[projectId]/locate # address + aerial, asked after engagement
  /(contractor)
    /dashboard                 # lead inbox
    /leads/[id]                # review + confirm
    /pricebook                 # cost item + assembly admin
  /api
    /price/route.ts
    /vision/route.ts
    /imagery/route.ts
/lib
  /pricing                     # PURE — no imports from app/ or db/
    engine.ts
    assemblies.ts
    disclosure.ts
    types.ts
    __tests__/
  /measure
    area.ts                    # turf wrappers
    reconcile.ts               # aerial vs photo arbitration
  /vision
    classify.ts                # Claude vision calls
  /db
    schema.ts
    queries.ts
/components
  /map                         # MapLibre + Terra Draw
  /configurator                # region panel, catalog picker, price rail
/seed
  pricebook.seed.ts            # your ~40 SKUs
```

---

## 5. Data model

```
Organization        contractor tenant; owns the price book
  ├─ CostItem       material | labor | equipment | disposal
  │                 { unitCost, unit, burdenPct, wasteFactorPct }
  ├─ Assembly       e.g. "Stone bed conversion, 3in over fabric"
  │                 { unit: SF, components: AssemblyComponent[] }
  │   └─ AssemblyComponent  { costItemId, qtyPerUnit, productionRate? }
  ├─ MarginConfig   { targetGmPct, minGmPct, contingencyPct }
  └─ DisclosurePolicy
        { mode: 'band' | 'tiers' | 'figure',
          bandWidthPct, showUnitRates: false, roundTo }

Property            { address, lat, lng, parcelGeom?,
                      imagerySource, imageryCapturedAt }

Project             { propertyId, orgId, status, customerContact }
  ├─ Region         { geom: GeoJSON.Polygon, kind: bed|turf|hardscape,
                      quantity: Quantity, existingMaterial? }
  │   └─ Selection  { assemblyId, skuOverrides }
  ├─ PointElement   { geom: Point, skuId, qty }   # trees, boulders, lights
  ├─ Photo          { url, exif, classifications[] }
  └─ EstimateSnapshot
        { issuedAt, lineItems (frozen JSON), internalTotal,
          customerFacingPayload, disclosurePolicyUsed }

MeasurementDelta    { regionId, beforeQty, afterQty, source,
                      correctedBy, correctedAt, jobType }
                    # ← the training corpus. Do not skip this table.
```

---

## 6. Phases

### Phase 1 — Pricing engine (no UI, no DB)

Build `/lib/pricing` as pure TypeScript. Model cost items, assemblies with
production rates, burden, waste factor, overhead, margin, and the disclosure
projection.

**Acceptance:** `npm test` passes against 10 scenarios you hand-calculate from
real bids, matching to within $1. Include at least one where the disclosure
policy must produce a band, one where it produces Good/Better/Best tiers, and
one asserting no internal rate leaks into the customer payload.

Do this first. It's pure logic, it's the part only you can specify correctly,
and everything downstream consumes it.

### Phase 1.5 — Typology bands

Before any UI, derive the opening price bands from historical bid data. For each
job type (bed renovation, mulch-to-stone conversion, foundation planting
refresh), compute the P25/P50/P75 of quantity, then run those through the Phase 1
engine to get a band. This is what the customer sees before anything has been
measured.

**Acceptance:** `getTypologyBand('mulch_to_stone', 'residential')` returns a
band, and you can defend both endpoints against real jobs you've priced.

### Phase 2 — The photo experience

This is the entry point and the moment the product either feels alive or
doesn't. Upload → storage → segmentation overlay on the customer's own photo,
labeling regions (lawn, bed, hardscape, foundation planting). Click a region →
catalog picker filtered to that region kind → visual swap → typology band shown
as "projects like this typically run $X–$Y."

No address required yet. No measurement yet. The goal is a customer clicking
around on a picture of their own yard inside thirty seconds of landing.

Generative rendering is acceptable here (see invariants), but prompts are built
only from catalog SKU entries.

**Acceptance:** Upload a photo, see labeled regions within a few seconds, swap
mulch to stone, get a defensible band — all without entering an address.

### Phase 3 — Aerial measurement layer

Now ask for the address. Geocode → MapLibre with satellite raster centered on
the parcel → Terra Draw polygons (auto-suggested where possible, user-adjustable)
→ Turf geodesic area. Map photo regions to aerial regions. Recompute pricing
from real quantities and **narrow the band visibly** — make that a deliberate UI
beat, not a silent update.

Also handle the customer who won't give an address: they still get a design and
a band, you still capture the lead.

**Acceptance:** Enter an address after designing, watch the band narrow, confirm
one drawn area against a known real measurement to within a few percent.

### Phase 3.5 — The time slider

The differentiated feature. Once plants are objects with metadata, growth is a
rendering parameter, not a separate model.

Growth curve: approach to mature size is roughly sigmoid, not linear. A simple
per-growth-rate-class lookup ("% of mature size at year N") is plenty for sales
purposes — nurseries publish this. Don't build a botany simulator.

Asset strategy for the MVP: one image per SKU, scaled, for shrubs, grasses, and
perennials. That breaks down for trees, where a juvenile isn't just a small
mature specimen — carry two or three states for trees only. Full multi-state
assets across the catalog is a v2 cost.

Two features fall out of the same data and both are worth building now:

- **Spacing validation.** Compare placed spacing against mature spread. Flag
  crowding at year 5 and suggest a corrected count and spacing. This is what a
  good designer does and it makes the contractor look competent.
- **Year-1 honesty.** Render year 1 accurately, sparse and all. Setting the
  expectation before the sale is the cheapest callback prevention available.

For HOA and commercial, pair the slider with phased budgeting — Phase 1 now at
$X, Phase 2 at year 3 at $Y — with the visual at each stage. That pairing is the
commercial wedge.

**Acceptance:** Drag the slider across year 1 → 3 → 5 on a design with mixed
shrubs and one tree. Bed geometry, hardscape, and house are pixel-identical
across all three frames; only plant scale changes. Place shrubs at 18 inches
with a 4-foot mature spread and confirm a crowding warning fires with a
corrected count.

### Phase 4 — Reconciliation and the second sensor

Claude vision call returning: existing material per visible region, vertical
elements present (walls, steps, grade change), and a list of things it cannot
see. Reconcile against the aerial number.

**Reconciliation is arbitration, not averaging.** Aerial wins horizontal area.
Photo wins material identity, condition, and anything vertical. Where they
overlap, use the delta as a QA signal: agreement inside 15% → tighten the band;
disagreement beyond 25% → flag for review and widen or request another photo.

Switch rendering to deterministic mode from this point forward, since the
displayed numbers are now quantity-derived.

**Acceptance:** A disagreement flag fires when you deliberately pair a photo
with a different property's address.

### Phase 5 — Lead capture and contractor dashboard

Customer submits → freeze an EstimateSnapshot → contractor inbox → detail view
showing the design, the quantities with provenance badges, confidence per
region, and any reconciliation flags.

**Acceptance:** Submit as a customer, see it appear in the contractor dashboard,
confirm the snapshot is byte-identical to what the customer saw.

### Phase 6 — The confirmation gate

Rep edits quantities on site. Each edit writes a MeasurementDelta and creates a
new Quantity with `source: 'rep_confirmed'` and a `supersedes` pointer. Final
quote generated from confirmed quantities. Original customer snapshot untouched.

**Acceptance:** Correct a bed from 400 to 470 SF. The delta is queryable, the
final quote uses 470, the customer's original snapshot still shows 400. Then run
a query: mean and P90 error by job type across all deltas. That query is the
whole business — make sure it works.

---

## 7. Seed data you need to supply

The build stalls without this, and nobody else can produce it:

- ~40 SKUs covering bed renovation and mulch-to-stone conversion
- **Plant metadata per living SKU** — install size (container or caliper),
  mature height and spread, growth rate class, form/habit, hardiness zone,
  deciduous vs evergreen. Without this the time slider cannot exist, so it has
  to be captured at seed time rather than backfilled.
- Costed assembly for each: material qty per unit, labor production rate,
  equipment, disposal, waste factor
- Your burden and overhead percentages
- Target and floor gross margin
- 10 historical bids with known actual quantities, for the Phase 1 golden tests
- **Quantity distributions by job type** — the P25/P50/P75 of bed area, turf
  area, and linear edging across your historical residential and HOA bids. This
  powers the Phase 1.5 typology bands and it's the reason the first screen can
  show a credible number before measuring anything. No competitor can produce it.

---

## 8. Session-one prompt for Claude Code

> Read `project-map.md`. Scaffold a Next.js 15 App Router project with
> TypeScript, Tailwind, and Drizzle against Postgres. Then implement `/lib/pricing`
> exactly as specified in section 1 and section 5 — pure functions, no DB or
> network imports, full type coverage. Write Vitest tests covering the assembly
> rollup, burden and waste application, margin, and the disclosure projection.
> Stop after Phase 1 acceptance passes. Do not build any UI yet.

Then one session per phase. Resist the urge to let it run ahead — the value of
this build is concentrated almost entirely in the pricing engine and the delta
table, and both get sloppy if they're generated alongside UI work.
