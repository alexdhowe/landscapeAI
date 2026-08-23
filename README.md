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
| Contractor auth | ✅ done — Auth.js, console and contractor APIs gated |
| `/pricebook` | ✅ done — full CRUD on immutable, published revisions |
| Photo storage — S3-compatible | ✅ done — `lib/storage`, bucket or local, migration 0004 |
| Design system | ✅ done — tokens in `app/globals.css`, one font pairing, primitives, loading/empty/error states |
| Photos off an iPhone | ✅ done — HEIC → JPEG, EXIF orientation baked in, GPS stripped, long edge capped |

All six phases are in, they run on Postgres, the contractor console is behind
a login, the price book is editable, photos live in object storage when a
bucket is configured, and the whole thing has been designed and opened on a
phone. `npm test` runs 336 tests — with a database and without one.

One gap is left from section 3 and it is not a coding gap: `/api/imagery`
waits on the **imagery provider decision**, which is a licensing question —
some tile licences prohibit deriving and reselling measurements, which is
exactly this product. `lib/imagery/provider.ts` is the shape that decision
will land in; the current Esri demo tiles sit behind it, flagged
`unreviewed`.

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind. Drizzle against Postgres —
schema in `lib/db/schema.ts`, migrations in `drizzle/`, every query in
`lib/db/queries.ts`. With no `DATABASE_URL` the app falls back to the file
store, so a clean checkout runs the demo with nothing to provision.

## Commands

```sh
npm test          # Vitest — 336 tests across every phase. No server, no network, no browser.
npm run typecheck
npm run dev
npm run build

npm run shots     # dev-only: drive the customer flow in a real browser at
                  # 390x844 and 1440x900, capture every surface, and audit
                  # horizontal scroll and 44px tap targets. Needs a running
                  # server; see "Looking at it" below.

npm run db:generate   # regenerate migrations from lib/db/schema.ts
npm run db:migrate    # apply them
npm run db:seed       # load the org's price book from seed/pricebook.seed.ts
npm run db:setup      # migrate + seed
npm run db:user -- --email sam@example.com --name "Sam Rep"   # a contractor login
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
- Projects live behind `lib/store/projects.ts` and photo bytes behind
  `lib/storage` — the only modules that know where anything is kept. See
  [photo storage](#photo-storage) and [the database](#the-database) below.
- The upload accepts **HEIC** and leads with the camera; what reaches
  storage is always upright, metadata-free and capped at 1600px on the long
  edge. See [a photo straight off an iPhone](#a-photo-straight-off-an-iphone).

## The design system

Everything visual resolves to a token in `app/globals.css`. Before that file
existed it was one line — `@import "tailwindcss"` — and eight sessions had
produced eight slightly different greens and no shared idea of what "muted
text" meant. The rule now is that **no component names a raw palette colour**,
and `lib/design/__tests__/tokens.test.ts` greps `app/` and `components/` to
keep it that way.

- **Five ramps, named for what they mean.** `bark` is the neutral, warm rather
  than grey — this is a company that works outdoors and a cold grey UI around
  a photograph of a garden looks like a spreadsheet. `canopy` is the brand
  green, deep and desaturated because a saturated "eco" green next to a real
  photograph reads synthetic. `survey` blue means *this number came from the
  aerial pass*. `clay` is refusal, `flag` is attention-without-alarm.
- **The ramps are tested, not eyeballed.** Same test computes WCAG contrast
  from the hex values: 600–950 is AA on white and on the page ground, 700–950
  is AA on its own 50/100 tints (which is what `Callout` and `Badge` do), and
  white is AA on 600–950 (which is what `Button` does). The 400 stop is
  asserted to be *below* AA, so reaching for it as a text colour is a
  documented boundary rather than an accident.
- **One font pairing through `next/font`.** Fraunces carries the wordmark and
  the top heading of a customer surface; Inter carries everything else,
  including every number in the console, with tabular figures anywhere numbers
  sit in a column.
- **Primitives only where something was already repeated three times.**
  `components/ui/` holds Button, Card/Callout/EmptyState/SectionHeader, Field,
  Badge, Skeleton and the Wordmark. That is the whole list. This was a design
  pass, not a framework.
- **Loading, empty and error states.** There was not a single `loading.tsx`,
  `error.tsx` or `not-found.tsx` in the tree. There are now, per route group
  and per heavy route, and each skeleton is in the shape of the thing it is
  waiting for so nothing jumps when it arrives.
- Metadata, per-route titles, a favicon (`app/icon.svg`) and an OG card
  (`app/opengraph-image.tsx`, drawn from the same tokens so it cannot drift
  from the product it pictures).

**Two audiences, one company.** The customer surfaces (`/`, `/start`,
`/design/*`) are mobile-first — the design target is a homeowner standing in
their yard holding a phone, not a desktop browser. The console (`/dashboard`,
`/leads/[id]`, `/deltas`, `/pricebook`, `/login`) is dense, desktop-first and
information-first, on darker chrome. The wordmark, the ramps and the
primitives are what make them the same product.

### Accessibility is part of the bar

- One focus treatment for the whole app, in a `:focus-visible` base rule.
  Four components had `focus:outline-none` with nothing in its place; none
  do now.
- AA contrast, enforced by the token test above.
- 44px minimum tap targets, enforced by the audit in `npm run shots`. The
  `tap-target` utility extends a hit area without changing how a control
  looks, for dense console rows.
- Real alt text, and deliberately *short* alt text on the photo canvases: a
  browser renders alt text at the image's place while it loads, and a
  sentence long enough to name every region is wide enough to stretch the
  column it sits in.
- **Keyboard access to the regions on the photo canvas.** The polygons were
  click targets and nothing else, so a keyboard could not reach any of them
  and the configurator was unusable without a pointer. The fix is not
  `tabIndex` on an SVG polygon — focus rings on SVG are inconsistent across
  browsers, a shape has no accessible name to speak, and on a 390px-wide
  photo the markers overlap each other so 44px hit areas around them steal
  one another's taps. Instead there is a **region strip** under the photo:
  one real button per region, in document order, 44px, no overlap, carrying
  `aria-pressed`. Focusing one highlights its polygon. What sits on the photo
  is a redundant pointer convenience, hidden from assistive technology so
  nothing is announced twice.

### Looking at it

`scripts/screenshots.mts` (`npm run shots`) drives the whole customer flow in
a real Chromium at 390×844 and 1440×900 — upload, segmentation wait, region
swap, band, submit — then signs in and captures the console. It writes PNGs
to `.shots/` and audits two rules that are easy to state and easy to break:
no horizontal scroll at 390px, and no interactive element under 44 CSS px. It
exits non-zero on a finding.

It is **not** part of `npm test`, which stays browser-free. Run it against a
server you have already started:

```sh
npm run build
AUTH_TRUST_HOST=1 AUTH_SECRET=$(openssl rand -base64 32) \
  CONTRACTOR_EMAIL=you@example.com CONTRACTOR_PASSWORD=… npm start &
npm run shots -- --photo ./some-photo.heic
```

Three real bugs came straight out of pointing it at a phone viewport: a grid
child with `min-width: auto` stretching the whole page sideways, region
markers stealing each other's taps, and a signed-in rep's lead photo coming
back 401 (see [contractor auth](#contractor-auth)).

### The thirty seconds, measured

§2's thesis is a customer clicking around their own yard inside thirty seconds
of landing. Nobody had ever measured it. On a production build, locally, with
a 12-megapixel portrait HEIC as the upload:

| Leg | 390×844 | 1440×900 |
|---|---|---|
| Landing → `/start` interactive | 39 ms | 33 ms |
| Photo chosen → design page | 1,637 ms | 1,230 ms |
| Landing → labelled regions | 3,754 ms | 3,817 ms |
| **Landing → first budget band** | **5,857 ms** | **6,475 ms** |

**That number does not include the vision call.** No `ANTHROPIC_API_KEY` was
available in the environment this was measured in, so segmentation fell back
to the demo overlay, which costs nothing. What the table says honestly is that
**everything this application does other than the model call spends about six
seconds of the thirty**, and roughly 1.5 s of that is the upload, most of
which is normalising a 12 MP HEIC in pure JavaScript.

So the remaining ~24 s is the Claude vision call, and it is the whole risk.
That is a real number somebody with a key should put in this table. The lever
on it, if it turns out to be tight, is `lib/vision/classify.ts`: the model and
the size of the JSON the prompt asks for. Segmentation quality against
latency is a product decision and this session did not make it.

**The wait is designed rather than papered over.** A band of light travels
down the customer's own photograph while the model reads it, with placeholder
chips in the shape of the labels that are coming; the local copy of the photo
appears within a few hundred milliseconds of the tap, long before the server
is finished with it, and the same motion continues on the design page so the
two read as one. A skeleton over the photo beats a spinner beside it: it keeps
the thing they came for on screen and it stops the layout jumping.

## A photo straight off an iPhone

`/start` used to accept JPEG, PNG, GIF and WebP. iPhones shoot HEIC. There was
also no "take a photo" affordance, which is the obvious thing to offer someone
standing in the yard they want re-landscaped. Both are fixed, and the fix
started with a structural problem rather than with a decoder.

### The list that was two lists

`SUPPORTED_IMAGE_MEDIA_TYPES` lived in `lib/vision/classify.ts` and the upload
route, the vision route and the classifier all read it as one list. It was
conflating **what a customer may upload** with **what Claude's vision API
accepts**, and those answers now differ. That conflation is what made
"accept HEIC" look like a one-line change to a constant.

They are two files now:

| | |
|---|---|
| `lib/vision/mediaTypes.ts` | `VISION_IMAGE_MEDIA_TYPES` — the vision API's contract. JPEG, PNG, GIF, WebP. Nothing may widen it. |
| `lib/image/mediaTypes.ts` | `UPLOAD_IMAGE_MEDIA_TYPES` — what a customer may send. The same four plus HEIC/HEIF. |

`lib/image/normalize.ts` is the bridge, and a test asserts the invariant that
holds the two together: **whatever a customer is allowed to upload, what
leaves normalisation is on the vision list.**

### What happens to the bytes

The upload route (`app/api/projects/route.ts`) is the only place in the
application that handles raw uploaded bytes, which is where the conversion
belongs. In one pass, before anything reaches `lib/storage`:

- **HEIC → JPEG.** Storing raw HEIC and serving it would render in Safari and
  break in Chrome, which is worse than rejecting it.
- **EXIF orientation baked into the pixels.** iPhone photos carry a rotation
  tag. The browser applies it and the vision model does not, so a portrait
  photo that keeps its tag gets segmented sideways and every polygon lands on
  the wrong part of the picture.
- **Long edge capped at 1600px.** Claude's vision API resizes anything whose
  long edge exceeds ~1568px before the model sees it, so every pixel above
  that is upload latency and nothing else — and the upload is on the critical
  path of the thirty seconds. 1600 sits just above that threshold and leaves
  the design canvas slightly more than the model uses. A 12 MP HEIC (815 KB)
  lands in storage as a 1200×1600 JPEG of 119 KB.
- **All metadata dropped, GPS included.** A photo of somebody's house does not
  need to carry their coordinates into the object store; the address is asked
  for separately, on its own screen, with a decline button. The encoder writes
  no EXIF at all, so this holds by construction rather than by a stripping
  pass that could miss a container.

`MAX_PHOTO_BYTES` was 8 MB, which a 48-megapixel iPhone photo exceeds
outright — the customer most likely to be standing in their yard with a phone
was the one most likely to be rejected. The ingest cap is now 25 MB
(`lib/image/limits.ts`), checked before the body is buffered, and what lands
in storage is far smaller because normalisation caps the long edge first.

The media type is decided from the **leading bytes**, not from the browser's
`File.type`: Safari reports `""` for a HEIC dragged out of Photos and an
Android picker reports `application/octet-stream` for anything it does not
recognise. The declared type is used only so a refusal can name what the
customer thinks they sent.

### The decoder, and what was checked before committing to it

The project had zero native dependencies and `npm test` needed no network and
no build step. Both are still true.

- **sharp was not used.** Its prebuilt binaries deliberately ship *without*
  HEIF support — libheif, libde265 and x265 are LGPL/GPL and HEVC is patent
  encumbered — so "just use sharp" would have produced a decoder that throws
  on exactly the format this is for, plus a native dependency in a tree that
  had none.
- **`heic-decode` + `jpeg-js`.** Three packages, no native code, no postinstall
  build: `heic-decode` (ISC) wraps `libheif-js` (**LGPL-3.0**, a prebuilt wasm
  bundle), and `jpeg-js` (BSD-3) does the JPEG leg. Both are imported lazily,
  so the ~6 MB wasm bundle only loads when a HEIC actually arrives. **The
  LGPL-3.0 dependency is worth a licence review before this ships** — it is
  used unmodified and resolved at runtime, which is the ordinary dynamic-
  linking reading, but that is a call for somebody with authority to make it,
  the same as the imagery decision.
- **Converting in the browser was considered and rejected on the thirty
  seconds.** Every in-browser HEIC decoder is the same libheif wasm build, and
  it would have to reach the phone *before* the first upload could start, over
  whatever cellular connection the customer is standing on — a multi-second
  tax on the first interaction of the funnel, paid by every visitor including
  the ones who upload a JPEG. On the server it is lazy, warm, and paid once.

**PNG, GIF and WebP pass through untouched.** Nothing shoots them — they are
screenshots and saved web images — so they carry no orientation tag and no
coordinates, and adding a PNG and a WebP codec to normalise formats no camera
produces would be dependency for its own sake. The cost is that they cannot be
shrunk, so they are held to a smaller ceiling that keeps them inside the vision
API's own per-image limit. If that ever bites a real customer the fix is a
decoder for the offending format in `lib/image`, and nothing above that module
has to change.

### Tested against a real HEIC

`lib/image/__tests__/fixtures/` holds three small committed files — a genuine
HEIF container with the rotation in its `irot` property and a GPS fix, the same
picture as a JPEG with `Orientation: 6` in the tag, and an upright JPEG with
GPS and nothing else to do. Each is four flat colour quadrants, so a test can
assert *which way up* the picture came out rather than merely that something
decoded. `lib/image/__tests__/upload.test.ts` puts the HEIC through the real
upload route into the in-process bucket fake and checks the three things that
were wrong: it is a JPEG so it renders in Chrome, it is portrait so the
polygons land right, and it carries no EXIF.

The fixtures were **generated, not shot** — nobody in this session had an
iPhone, and a photo of a real house is not a thing to commit to a repository.
`scripts/make-image-fixtures.py` is the generator and
`lib/image/__tests__/fixtures/README.md` says so; the tests assert
relationships rather than pinned bytes, so dropping in a real capture works.

### On the phone

`/start` leads with the camera. `capture="environment"` is offered only where
there is a camera to open — it is ignored on a desktop browser, so showing it
there would be two buttons that do the same thing — and the drag-and-drop
target only appears where there is something to drag with. Each control is a
styled `<label>` wrapping a visually-hidden file input: one tab stop,
announced as a file input, with the focus ring on the label. The moment a file
is chosen the browser's own copy of it fills the screen, dimmed, with the
segmentation sweep already running.

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
- Satellite tiles come from `lib/imagery/provider.ts` and default to Esri
  World Imagery for the demo; override with `NEXT_PUBLIC_SATELLITE_TILE_URL`
  / `NEXT_PUBLIC_SATELLITE_ATTRIBUTION`. **Before production**:
  derivative-measurement licensing (Nearmap/Vexcel) is the real decision —
  see project-map §3 and [the imagery seam](#the-satellite-imagery-seam).

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

## The price book

`/pricebook` (project-map section 4), admin only. Full CRUD on cost items,
assemblies and their component lines, margin, both disclosure policies, and
the job-type recipes behind the opening band.

**Editing is copy-on-write.** A published revision is frozen — nothing in
`lib/db/queries.ts` updates a row belonging to one, and `writeRevisionConfig`
refuses outright. Editing anything opens a **draft** (at most one per org,
enforced by a partial unique index), which copies the current book. The draft
prices nobody. Publishing is a separate, validated act that numbers the
revision, stamps who did it, and becomes the book every new estimate is built
from.

This is the same rule the rest of the system already lives by. Estimates are
immutable snapshots; a snapshot is only interpretable against the prices that
produced it; so the prices have to stop changing underneath it. Every
`EstimateSnapshot` records its `priceBookRevisionId`, so a measurement delta
from March stays readable against the book that was in force in March —
`resolveOrgAt(date)` returns it.

There is no separate audit log. Revisions are immutable, so the **diff
between two of them is what happened**, and unlike an audit table it cannot
drift from the rows it describes. `/pricebook` renders that as the history:
"Revision 2 · Spring 2026 mulch increase · Sam Rep · Cost item
mulch_hardwood: unitCost 38 → 46".

### The publish gate

A draft may be broken — that is what a draft is for. Publishing may not be,
and `lib/pricebook/validate.ts` is the gate. The rule it exists for is
section 1's:

> **The catalog is the guardrail.** Every option a customer can click must
> map to assemblies and SKUs that exist.

Delete an assembly the configurator offers and the publish is refused with
the option named. It also refuses a component pointing at an unstocked SKU, a
margin floor above the target, a rounding increment of zero, tier mode with
fewer than two tiers, unordered percentiles, and any policy that would show
unit rates. Warnings — a SKU nothing uses yet — do not block: that is a
contractor mid-thought, not a mistake.

Deletes refuse rather than cascade. Removing a SKU two assemblies price with
returns 409 naming both, because a cascade would carry the mistake across the
book silently.

`lib/pricebook/` is pure and carries most of the tests: `validate.ts`,
`diff.ts`, `mutate.ts` (every edit is a pure function from one config to the
next) and `parse.ts` (strict — a silently-coerced NaN here is a wrong price
in front of a customer). `service.ts` is the only part that touches a
database.

Without a `DATABASE_URL` the book is `seed/pricebook.seed.ts` served as
"revision 0" and the page says so rather than offering an edit with nowhere
to go.

## Contractor auth

Auth.js (section 3), contractor side only. Customers never sign in — they
are a contact on a lead, not an account — and every customer surface stays
anonymous: `/start`, `/design/[id]`, `/api/price`, submitting, and reading
back their own snapshot and quote.

Everything under `app/(contractor)/` is gated, and so are the two API routes
that act as the contractor:

| Route | Before | Now |
|---|---|---|
| `/dashboard`, `/leads/[id]`, `/deltas` | open | session required |
| `POST /api/projects/[id]/confirm` | open | session required |
| `POST /api/projects/[id]/quote` | open | session required |
| `GET /api/projects/[id]/quote`, `…/snapshot` | open | still open — the customer reading what they were given |

That first row was the reason to do this before anything else: the console
renders unit costs, direct cost, gross margin and every lead's name, email
and phone, and none of it was behind anything.

Two layers, deliberately:

- `middleware.ts` checks only that a session cookie is **present** and
  redirects to `/login` when it isn't. It does not verify the token —
  middleware runs on every matched request and can't reach the database.
  Treat it as UX.
- `app/(contractor)/layout.tsx` and `requireContractor()` do the real
  verification. A forged cookie gets past the middleware and no further;
  there's a test for exactly that.

**The rep is the session now.** `correctedBy` on a `MeasurementDelta` used
to be a text field the client filled in — anyone could type any name onto a
correction. It now comes from the signed-in contractor, and the confirm
route ignores the body field entirely. The delta is the training corpus and
`correctedBy` is its provenance; provenance the caller asserts for itself
isn't provenance. The lead page shows the name read-only rather than asking
for it.

**Which cookie a session is read from.** Auth.js picks the `__Secure-` cookie
prefix from the **scheme of the request**, not from `NODE_ENV` — a `__Secure-`
cookie is only valid over HTTPS. `lib/auth/session.ts` read `NODE_ENV` alone,
so a production build served over plain HTTP looked for a cookie name that
had never been written. The symptom was a signed-in rep whose lead page
rendered (server components read the session through Auth.js and found it)
but whose lead photo came back 401 (route handlers read it through this
module and did not). It now tries both names. That is not a weakening: the
cookie name is also the JWE salt, so a token still only decodes under the name
it was actually written with — there is a test for exactly that. Found by
running `npm run shots` against a production build.

Passwords are scrypt from `node:crypto` — no dependency — with the cost
parameters and salt encoded in the stored string, so the cost can be raised
later without a migration and old hashes keep verifying. Sessions are JWTs
in a cookie rather than rows: the only thing a session carries is an
identity the database can re-check, so a session table would be one more
thing to migrate for no authorization benefit at this size.

```sh
export AUTH_SECRET=$(openssl rand -base64 32)   # required in production
npm run db:user -- --email sam@example.com --name "Sam Rep" --role admin
```

`db:user` prompts for the password rather than taking it as an argument, so
it stays out of shell history. There is no self-service signup. Without a
database there's no user table, so a single login can be configured with
`CONTRACTOR_EMAIL` / `CONTRACTOR_PASSWORD`; leave those unset and nobody can
sign in, which is the safe default rather than a broken one. **There is no
default password anywhere in this repo.**

## Photo storage

Project-map section 3 puts photos in S3-compatible object storage (R2,
Supabase Storage) and section 5's `Photo` carries a `url`. `lib/storage` is
that seam, with the same two-backend shape as `lib/store`:

```sh
export S3_BUCKET=landscape-photos
export S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
export S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=…
```

Set those and uploaded photos go to the bucket; leave them unset and the
bytes stay where they always were — a `photo_objects` row with a
`DATABASE_URL`, a file under `.data/` without one — so a clean checkout still
runs the demo with nothing to provision. Nothing above `lib/storage` knows
which: a project carries a **locator** it never parses.

- **The locator records the backend, the environment only picks the next
  one.** `inline:photos/<uuid>.jpg` or `s3:photos/<uuid>.jpg`. Point a
  running deployment at R2 and yesterday's photos still resolve, because
  their locator still says `inline:`. A test covers exactly that switch.
- **Half-configured object storage is a fatal error, never a quiet fall
  back.** A deployment that set three of the four variables and silently
  kept filling its own database would look fine until the disk did not.
  Uploads answer 503 and the log says why.
- **SigV4 over `fetch`, no SDK.** Two calls are needed — PUT an object, GET
  it back — and the signing is ~60 lines of `node:crypto`. An SDK would be
  the largest dependency in the tree for it. `lib/storage/s3.ts`.
- `photos.bytes` is gone. **Migration 0004** moves every existing row's bytes
  into `photo_objects` and backfills `photos.url` — section 5's field, which
  was null on every row — with the locator that finds them. The backfill
  joins against the object that actually landed, so a row whose bytes did not
  move keeps a null `url` and the `SET NOT NULL` fails the migration rather
  than leaving a lead with a photo that 404s. Verified against a live
  Postgres holding pre-migration rows: bytes moved byte-identical, and the
  migrated project still serves through the route.

### Who may read a photo

A photo of somebody's house is not a price band, so this is a decision and
not an accident. It is written out in full at the top of
`lib/storage/index.ts`; in short:

| | |
|---|---|
| The bucket | **private, always** — no public object URL, no ACL on upload. Every read is streamed by the app. |
| The customer read | `GET /api/projects/[id]/photo`, open to whoever holds the project UUID — **deliberately**, and documented as such. |
| The contractor read | `GET /api/leads/[id]/photo`, **behind the auth guard**. The console never borrows the customer's open route. |

The assumption behind the middle row, stated so it can be overruled: a photo
is no more sensitive than the design, address and contact details hanging off
the same UUID, and the customer never signs in. A signed URL or a token on
the photo alone would not raise the bar — whoever holds the UUID can load the
design page and be handed a fresh one; it would only move the credential. If
that assumption is wrong, the fix is a per-project token required by **every**
customer-facing project route, not by this one. The contractor split is what
makes that change cheap: the console is already off the open route.

### Tests need no bucket

`lib/storage/__tests__/fakeBucket.ts` is an S3-compatible bucket in process —
a loopback HTTP server that refuses an unsigned request and refuses one whose
`x-amz-content-sha256` does not match the body it received, so a signing bug
cannot pass. The local backend runs in a temp directory. The acceptance path
(`photos.test.ts`) uploads through the real route with a bucket configured,
asserts the bytes are in it and **not** in this deployment, renders both the
customer and contractor surfaces, then unsets the config and does it all
again on the fallback.

## The satellite imagery seam

`lib/imagery/provider.ts` holds the *shape* of the provider decision, not the
decision. Section 3 calls it "the real one" and it is a licensing question:
some tile licences prohibit deriving and reselling measurements, which is
exactly what this product does. Every provider carries the field the decision
turns on — `derivativeMeasurements: 'unreviewed' | 'prohibited' | 'permitted'`
— and the Esri demo tiles the map draws today are `unreviewed`. Nothing
assumes a licence nobody declared: an unrecognised value is `unreviewed`, not
a yes. When a licence is signed it is a constant in that file.

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

With a database, that file is **seed input**: `npm run db:seed` writes it onto
the org as **revision 1, published**, and the routes read the rows. From then
on the book is edited at `/pricebook`, which is why re-seeding never
overwrites an existing org — its book has almost certainly moved on.

`lib/catalog/__tests__/options.test.ts` still checks the catalog against this
file, which stays correct: the seed has to satisfy the guardrail. What the
publish validator adds is the same check against a book a contractor has
since edited.

Current WI-average opening bands (sell price):

| Job type | Residential | HOA / commercial |
|---|---|---|
| Mulch-to-stone conversion | $1,600 – $5,900 | $6,300 – $26,000 |
| Bed renovation | $2,700 – $8,200 | $10,300 – $39,500 |
| Foundation planting refresh | $1,200 – $3,300 | $3,500 – $12,600 |
