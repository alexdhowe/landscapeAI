# MyScape

Design-to-estimate MVP for landscape contractors. A homeowner uploads a photo,
plays with their yard, sees a budget band; the aerial pass measures the real
property and narrows it; a rep confirms on site and every correction is logged.

The full build plan lives in [`project-map.md`](./project-map.md). Read it
before touching anything — section 1 lists architectural invariants that are
not negotiable.

## The name

The product is **MyScape**. It is spelled once, in `lib/site/brand.ts`, and
the surfaces that show it — the wordmark on every customer page and the
contractor console, the metadata that titles every page, the OG image drawn
for shared links — import it from there. A test reads those files and fails
if any of them spells the name for itself, because a header saying one thing
while the browser tab says another is drift nobody notices in review: each
file looks correct on its own.

Renamed from LandscapeAI. Deliberately **not** renamed, because they are
identifiers rather than branding and changing them breaks or orphans
things: the npm package (`landscape-ai`), the Render service and Fly app
names, the local Postgres database in `drizzle.config.ts`, and the git
repository. Those are a deployment decision for whenever there is a
deployment.

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
| Rate limiting | ✅ done — per-IP token buckets at the app's edge, tightest on upload and vision |
| Deployment configuration | ✅ done — Dockerfile, `render.yaml` (free), `fly.toml` (paid), `docs/deploy.md`. **Not yet deployed** |
| Design pass on a photograph | ✅ done — customer copy on customer surfaces, region names that do not cover the swap, `npm run shots` actually rendering the phone |
| Contractor login on a self-hosted deployment | ✅ fixed — `trustHost`; it threw `UntrustedHost` on every deployment target |
| Segmentation against a real photo | ✅ **the model was right all along** — a real yard's bed came back at 27 vertices and 25.5% of frame; the second pass was flattening it |
| The second pass moving the ground | ✅ fixed — it reported a ground line along the bottom of the photo and every region was pulled onto it |
| Outlines placed too high by the model | ✅ the second pass fixes it — and the merge was throwing the fix away. Bounds widened; plants matched by geometry, not by ids the model will not echo |
| The fill eating a narrow region | ✅ fixed — a frame-sized inset took 33% of a walkway strip's area and a rounding error off the lawn beside it; it scales to the region now |
| The ground clamp eating a raised bed | ✅ fixed — a bed behind a retaining wall is above the ground line by definition; the clamp now corrects a region but never guts one |
| Which stage makes an outline wrong | ✅ observable — `npm run segment` writes one image per stage; the parser no longer hides the model's own polygons |
| Plug-and-play plants | ✅ done — hover to identify, swap one plant for another, priced and frozen like any other choice |
| Correcting an outline | ✅ done — drag the edge on the photo, or nudge the whole edge in or out; the model's polygon is kept alongside |
| "Push it out" pushing it in | ✅ fixed — the offset read its amount through `Math.abs`, so both nudge buttons moved the edge the same way |
| What the vision call costs | ✅ instrumented — every segmentation logs one line: total, first pass, second look, and how much of the second look survived the merge |
| The vision call's latency | ⚖️ accepted — 56-75s per upload against §2's thirty. The accuracy is worth the wait; do not optimise it away without asking |
| The wait the customer sits through | ✅ **honest** — a bar off the two real passes, an estimate from the photo's own pixel count, and the region names on screen a minute before the outlines |
| A reload during that wait | ✅ fixed — it bought a second metered vision call for an answer the first one was already producing |
| A ring of old mulch around every plant | ✅ fixed — the cut-out was 18% wider than the plant and then blurred wider still; the material now reaches the plant's own edge |
| "Granite that just colours the mulch grey" | ✅ fixed — the filters ran in linearRGB, the noise was never spread across its ramp, one generator served six materials, and the photo's own grain was multiplied back at full detail |
| "Tell me that looks like real river rock" | ✅ fixed — it did not, because turbulence is a cloud and gravel is objects: no edges, so no pieces, so grey fabric with blotches in it. The pieces are drawn now — rounded stones, angular chips, shreds of bark, at the material's own gauge, over a dark ground, on two tiles that never line up |
| A bed of boulders | ✅ fixed — the gauge was a fraction of the frame, which is not a gauge: a "1.5in river rock" was drawn about twelve times life size. It comes from the region's own reported area now |
| Taking the plants out | ✅ done — clear one or a whole bed, the hole is clone-stamped out of the photograph itself, and every removal is bid as `shrub_removal` |
| "It fills the hole in like MS Paint" | ✅ fixed — the fill was a repaint in a material nobody chose, clipped to the bed so the half of a shrub standing against the brick survived it. It is real pixels now: a hole cut wide, tiled from the nearest clean piece of that bed, and the slices that stood above or below the bed filled from what was actually behind them |
| A stamped rectangle where a plant had been | ✅ fixed — the fill was tiling a thumbnail of bed six times across one hole, and reaching across a bed for a big bright patch to do it with. It magnifies a small patch rather than repeating it, and will not cross a bed for one in different light |
| "It reads as a decal, not as ground" | ✅ fixed — three separate causes, all found on one real photograph. The pieces were drawn with a mathematically hard vector edge over a flat ground and no surface under them, so a sub-grain finer than one piece is multiplied over all of them now; every piece was near enough the same size, so the distribution runs 0.45–2.0× squared, with a shred varying in length far more than in thickness; and the gaps read as black cut-out lines, so the ground sits at 0.76 of the darkest piece |
| A bed of one stone size, edge to edge | ✅ fixed — the other half of "maybe the scaling or the angle doesn't match". The photograph carries the answer: shrubs in one bed are roughly one size in the world, so how their drawn size falls off up the frame *is* the perspective. `lib/design/perspective.ts` fits a horizon through the plant ellipses — on the first real bed it landed on the porch floor line — and the material is drawn in three depth bands that crossfade into one another |
| A hedge drawn as a row of ovals | ✅ fixed — the plant cut-outs were painted one over the next, so a later one's pale rim overwrote an earlier one's dark core and seven boxwoods grown into one hedge came out as seven ovals with seams between them. They are darkened together now, which is what a union of cut-outs means |
| Material that ignored the light it was sitting in | ✅ fixed — the shading ramp mapped the photo's whole 0..1 luminance onto a 0.52–1.0 multiplier, so a bed that lives in the bottom third of that range moved barely at all. Measured across one real yard: the photograph ranged 1.47× and the material over it 1.22×, with its bright end where the photo was dim. A steep absolute ramp, blurred past the *things* in a bed rather than just their grain, gets 1.42× and falls off where the photograph does |
| Putting a plant in where there was none | ✅ done — drag one off the palette onto the bed and it is drawn at the size the catalog says it grows to, against that region's own scale and the perspective at the row it lands in. The bed it went into is decided server-side from the outlines, and the plant is checked against the catalog *for that region* — a shade tree still cannot be dropped against the house |
| Moving a plant that is already there | ✅ done — drag it anywhere in its bed, no mode and no toggle; the drop is confined to the outline server-side and each move is bid as `shrub_transplant` |
| The three drags, driven with a mouse | ✅ verified — `npm run shots` drives press-and-lift and press-and-travel across the threshold and asserts they did *different* things, then drags a plant off the palette and drags the bed edge. Three of the four now pass at 1440×900 and 1920×1080; the fourth is the row below |
| A click on a plant read as a drag | ✅ **fixed — a real bug, and only a mouse could find it.** The threshold was a fraction of the *frame*, and the frame is not a fixed size: 0.0045 is seven screen pixels on a 1600px-wide photo and two on a 435px one. Two pixels is inside the movement of an ordinary click, so pressing a plant to open its picker dragged the plant instead. It is `max(0.0045 × frame width, 5px)` now — `isDragTravel` in `lib/design/plantPlacement.ts`, with the decision moved out of the component so it is covered by `npm test` |
| A photograph taller than the screen | ✅ fixed — width-driven sizing is right on a phone and made a portrait photo 956px tall on a 1440×900 laptop. The frame is capped by *width* derived from the aspect ratio, because the overlay is `inset-0` of that box: cap the image's height instead and the outlines drift off the photograph |
| Reaching the plant palette on a desktop | ⚠️ **open** — measured at 1273px from the top of the photo to the bottom of the "Add a plant" palette, against a 900px laptop and a 1080px monitor. So "Drag one onto your photo" names a gesture whose two ends are not on screen together, and `npm run shots` reports it rather than pretending otherwise. The palette's buttons still *click* to drop a plant in the middle of the open bed, so the feature is reachable; the drag is what is not. The fix is a shorter rail, which is a design decision rather than a patch |
| Desktop as the primary surface | ✅ addressed — `/start` no longer tells somebody at a desk to point a camera: the drop zone *is* the button, paste is bound at the window, and the verbs are chosen by pointer type (`components/ui/ByPointer.tsx`). `npm run shots` audits 1920×1080 alongside 1440×900 and 390×844 |
| The 44px rule on a desktop | ✅ corrected — it is a *fingertip* floor and was being applied to a mouse, which reported every 38px button in the price book as a defect and buried the 18px-tall links next to them. 44px on coarse pointers, 24px on fine |
| A moved plant read as a misplaced one | ✅ fixed — the canvas published each plant's *reported* position in `data-cx` while rendering it at its *resolved* one, so the browser pass flagged every moved plant as badly placed: the one thing a move is supposed to do |
| Segmentation on a real key | ⏳ **still the gap this session was meant to close.** The key works (`npm run doctor` gets an accepted-key answer from the real API) and a photo with no landscape in it comes back with zero regions and the right "No landscape areas found in this photo" screen. But no real yard photograph has been through it: this environment's egress policy blocks Drive, and the connector returns files as inline base64, which multi-megabyte photos do not survive. **Every one of the eight rendering features above is still judged only against a hand-traced segmentation** |
| The "drizzle-kit hang" | ✅ **root-caused and fixed.** It was never drizzle-kit. Neon's console hands out a connection string ending `&channel_binding=require`, which is a libpq *client* parameter; postgres.js forwards anything it does not recognise into the startup packet, and the server refuses it. The app and the seed report that error — `drizzle-kit migrate` prints `applying migrations...` and spins forever with no error and no exit, which is what the eleventh session worked around with psql. Reproduced deliberately, then fixed: `normalizeConnectionUrl` in `lib/db/client.ts` strips libpq's client-side parameters, and the app, `drizzle.config.ts` and `db:migrate:direct` all go through it |
| `npm run db:migrate` against a real server | ✅ verified — 12 migrations in ~2s over TCP and over TLS, a 1s idempotent re-run, clean exit, and now with a raw Neon-shaped string too. `npm run db:migrate:direct` is the fallback, journal-compatible with drizzle-kit in both directions, and it names the failure above in about a second where the CLI hangs |
| The HEIC path on the artifact the container runs | ✅ verified — a HEIC posted to `.next/standalone/server.js` (not `next start`) came back a real baseline JPEG. libheif's wasm is inlined into the traced chunk, so there is nothing for the Dockerfile to copy and nothing for a bundler to drop. The image build itself is still unrun: no Docker daemon in this session |
| What Render would actually deploy | ⚠️ **the default branch is 8 commits behind `main`** — and those 8 commits are the whole of this table's last eight rows. `docs/deploy.md` §2.1 has the two ways to fix it. Not a code defect; a deploy that would have looked fine and shipped the wrong product |
| Which header the rate limiter may trust | ⏳ unresolved by design — it is a fact about Render's proxy, not something to reason out here. `docs/deploy.md` §8 step 7 is a two-minute experiment against the live deployment that settles it |
| The contractor console, end to end | ✅ verified against Postgres — sign in, open a lead, correct 300 SF to 352.5, the snapshot is byte-identical either side of the correction (384 bytes both times), the final quote issues and carries no `unitCost`, `burdenPct`, `marginPct` or `internalTotal`, four rows land at `/deltas`, and `GET /api/leads/[id]/photo` is 401 signed out |
| The aerial leg (`/design/[id]/locate`) | ⛔ gated off — deliberately: no paid imagery or geocoder until there is a working MVP |

All six phases are in, they run on Postgres, the contractor console is behind
a login, the price book is editable, photos live in object storage when a
bucket is configured, and the whole thing has been designed and opened on a
phone — on a phone *branch*, for the first time in the twelfth session,
which is its own story. `npm test` runs 784 tests — with a database and
without one.

The primary surface is a **desktop browser** now. The customer surfaces
were built mobile-first and it showed: `/start` opened with "point your
camera" next to a mouse pointer, and the photo somebody at a desk
actually has — already on their disk or already on their clipboard — had
a dashed rectangle below the fold and no paste at all. That is fixed, and
`npm run shots` audits a 1920×1080 monitor as well as a laptop and a
phone.

**It has not been deployed.** The tenth session wrote the configuration —
[`docs/deploy.md`](./docs/deploy.md) is the runbook, `Dockerfile` and
`fly.toml` are the artifact — closed the one code gap that made deploying
irresponsible (nothing throttled ten anonymous API routes), and verified
the production build end to end locally. It had no cloud account, no
domain and no Anthropic key, so the deploy itself, the measurement of the
vision call and the acceptance run from a real phone are the next hands-on
step. See [three decisions that gate the launch](#three-decisions-that-gate-the-launch)
for what must be answered first, and
[putting it in front of people](#putting-it-in-front-of-people) for what
changed.

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind. Drizzle against Postgres —
schema in `lib/db/schema.ts`, migrations in `drizzle/`, every query in
`lib/db/queries.ts`. With no `DATABASE_URL` the app falls back to the file
store, so a clean checkout runs the demo with nothing to provision.

## Commands

```sh
npm run doctor    # is this machine set up? checks .env.local, the API key (against the
                  # real API), and the console login — and says what to fix, in English.
npm test          # Vitest — 784 tests across every phase. No server, no network, no browser.
npm run typecheck
npm run dev
npm run build

npm run segment   # dev-only: segment one photo and write what every stage did to
                  # the outlines — the model's own polygons, after the ground
                  # clamp, after the second look, and as drawn. Needs a key.

npm run shots     # dev-only: drive the customer flow in a real browser at
                  # 390x844, 1440x900 and 1920x1080, capture every surface,
                  # and audit horizontal scroll and pointer target size.
                  # On the desktop viewports it also drives the three drags
                  # with a real mouse — a plant, a plant off the palette,
                  # and the bed edge — and checks that a press which stayed
                  # under DRAG_THRESHOLD opened the picker instead. Includes the three
                  # states of the segmentation wait, which no run with a key
                  # is slow enough and no run without one is long enough to
                  # reach — they are driven by answering the design page's own
                  # poll. Needs a running server; see "Looking at it" below.

npm run db:generate   # regenerate migrations from lib/db/schema.ts
npm run db:migrate    # apply them
npm run db:migrate:direct   # the same migrations without the drizzle-kit CLI: a connect
                            # timeout, a count of what it did, and a process that exits.
                            # For when the CLI will not finish. See docs/deploy.md §2.1.
npm run db:seed       # load the org's price book from seed/pricebook.seed.ts
npm run db:setup      # migrate + seed
npm run db:user -- --email sam@example.com --name "Sam Rep"   # a contractor login
```

See `.env.example` for what is configurable — all of it optional for local
work, and not for a deployment: [`docs/deploy.md`](./docs/deploy.md) says
which variables a production instance cannot open without.

## Running it on your own machine, and letting someone else try it

The fastest way to find out whether this product works is not a
deployment. It is your laptop, a real API key, and a photograph of a real
yard — and a link you can text to someone while you watch the logs.

**What you need:** Node 22 (`.nvmrc` pins it), and an `ANTHROPIC_API_KEY`.
Nothing else — no database, no bucket, no accounts. Projects and photos
land in `.data/` on your disk, and the only thing that leaves the machine
is the photo, to the Anthropic API, for segmentation.

```sh
git clone https://github.com/alexdhowe/landscapeAI.git
cd landscapeAI
npm ci
```

Create `.env.local` (it is gitignored, and nothing in it is ever
committed):

```sh
ANTHROPIC_API_KEY=…            # without it you get the labelled demo overlay
VISION_REFINE=off              # optional: skip the outline-correcting second
                               # vision call, which costs latency per upload
AUTH_SECRET=…                  # any long random string; only needed by `npm start`
CONTRACTOR_EMAIL=you@example.com     # so you can sign in to the console
CONTRACTOR_PASSWORD=…                # with no database, this is the whole user table
```

Check the setup before you start — this catches every way the key can be
wrong, and prints the absolute path of the file it is reading:

```sh
npm run doctor
```

Then build and run it:

```sh
npm run build && npm start     # http://localhost:3000
```

Use `npm run dev` instead when you want to edit code — it recompiles as you
go, at the cost of a few seconds on the first hit of each page. `npm start`
serves in a few milliseconds, which is what you want when somebody else is
looking.

### A link to send someone

While it is running, open a second terminal:

```sh
brew install cloudflared                                  # once
cloudflared tunnel --url http://localhost:3000
```

It prints a public `https://….trycloudflare.com` address. No account, no
card, no signup, and it works on a phone — which matters, because the
camera path is the one that cannot be tested any other way. Close the
terminal and the link is gone. (`npx cloudflared tunnel --url
http://localhost:3000` works too if you would rather not install anything;
ngrok is the alternative if Cloudflare is blocked on your network.)

Two things to know while a tunnel is up:

- **Every visitor shares your laptop's rate limit buckets** unless the
  tunnel forwards a per-client address. If a tester sees "Too many
  requests", put `RATE_LIMIT=off` in `.env.local` and restart — it is the
  one setting meant for exactly this.
- **This is a demo, not a deployment.** The link dies with the terminal,
  the data is on your disk, and real customer photos should not go through
  it. `docs/deploy.md` is for when it should stay up without you.

### What you are actually testing

These three are the open questions, and none of them has ever been
answered — every session to date, including the one that measured the
thirty seconds, ran on the demo overlay because no key was available:

1. **Does segmentation find the right things?** Upload a photo of a real
   yard and look at where the polygons land. This is the product.
2. **How long does it take?** The README's table below excludes the model
   call entirely. This is the number that decides whether §2's thirty
   seconds is real.
3. **Does the swapped material look convincing** over a photograph rather
   than over the four-colour test fixture nobody would mistake for a yard?

### When the key is the problem

It usually is, and it used to be needlessly hard to tell — a stray quote, a
trailing space, the placeholder still in the file, a key with no credit and
a genuinely wrong key all produced one 401, rendered to the customer as raw
JSON. Three things changed:

- **`npm run doctor`** distinguishes them, and asks the API directly.
- **The key is cleaned before use** (`lib/vision/credentials.ts`) —
  surrounding quotes and whitespace are what a paste brings with it, not a
  reason to fail. A placeholder value now yields the labelled demo overlay
  and one loud line in the terminal, rather than an error at the customer.
- **The customer and the operator get different messages.** A customer is
  told they can try another photo or send the design anyway, which is true
  and actionable; the terminal gets the real error and the one-line fix. In
  development the detail appears on the page too, because whoever is
  looking at the screen is also the person who can fix it.

**The key is read once, when the server boots.** Editing `.env.local` while
it runs changes nothing until you stop it and start it again — that alone
accounts for a good share of "the key is right and it still fails".

If the answer to 2 is bad, the first lever is `lib/vision/classify.ts` —
and the cheapest one is not a smaller model. That call currently runs at
default effort with thinking on, for a response that is a list of polygons.

## Three decisions that gate the launch — answered

None of these is a coding decision and all three were researched rather
than guessed at. The owner answered all three at the end of the deployment
session; each finding is kept below, with the decision it produced, so the
next session does not re-open a settled question or mistake a deliberate
gap for an oversight.

| Decision | Answer | What would reopen it |
|---|---|---|
| Imagery licence | **Hold** — no paid imagery until there is a working MVP. The aerial leg stays gated. | An MVP that earns it, then a licence that permits derivative measurement. |
| Geocoder | **Hold** — same reasoning. Gates the same surface, so answering one alone would change nothing. | Same. |
| `libheif-js` (LGPL-3.0) | **Accepted** on the hosted-only reading: server-side, unmodified, nothing conveyed. | Shipping an on-prem build, a native or Electron app, or moving decode into the browser — each is distribution, and §4 then applies. |

A fourth question was re-asked rather than decided fresh: the customer
photo read stays **open to whoever holds the project UUID**, affirmed by
the owner with the deployment in view. See
[who may read a photo](#who-may-read-a-photo).

**1. The imagery licence — project-map §3 calls it "the real one."** Some
tile licences prohibit deriving and reselling measurements, which is
precisely what the aerial leg does. The Esri World Imagery tiles the map
draws today are flagged `unreviewed` in `lib/imagery/provider.ts` — nobody
has read Esri's terms against this use — and Nearmap and Vexcel are the
candidates that licence derivative measurement cleanly, per property.
**Until a licence is declared `permitted`, `/design/[projectId]/locate` does
not go live**, and that is now enforced rather than noted: see
[the aerial leg is licensed, not built](#the-aerial-leg-is-licensed-not-built).
**Decided: hold.** No paid imagery until there is a working MVP — so the
aerial leg ships dark, deliberately, and the funnel runs on the typology
band alone.

**2. The geocoder.** `lib/geo/geocode.ts` is Nominatim, whose usage policy
does not cover production commercial traffic — it asks for a single thread,
attribution, and no heavy or commercial use of the public endpoint. Mapbox
and Google are the paid candidates §3 names. Same class of decision, same
surface, and it gates the same leg. **Decided: hold**, for the same reason
— and holding on one alone would change nothing, since either undeclared
term keeps the leg off.

**3. `libheif-js` is LGPL-3.0**, and it decodes every iPhone photo. What was
actually checked, rather than assumed:

- The dependency chain is `heic-decode` (ISC) → `libheif-js` (LGPL-3.0), a
  prebuilt Emscripten build of libheif. The bundled `LICENSE` is the LGPL-3
  text plus the GPL-3 it incorporates by reference, plus MIT for the sample
  wrappers.
- **What is actually compiled into the wasm matters and was inspected.**
  The bundle contains libheif and **libde265** — both LGPL-3.0 — and
  contains no `x265`, no `libaom`, no `dav1d`. That is the good case: x265
  is GPL-2.0, and had the encoder been in there the analysis would be a
  different one.
- **The obligation turns on distribution, and there is none.** LGPL-3.0
  attaches its conditions to *conveying* the work. Running it on your own
  server for network users is not conveying — that is what the AGPL adds
  and the LGPL does not — so a hosted deployment triggers no source-
  provision obligation. The library is used **unmodified** and resolved at
  runtime, so §2's modification terms do not bite either.
- **What is conveyed to a browser: nothing.** The decoder is loaded lazily,
  server-side, in the upload route (`lib/image/normalize.ts`), and the
  session that added it rejected in-browser decoding on latency grounds.
  That decision is now also the thing keeping this analysis simple, and it
  is worth not reversing casually: shipping the wasm to browsers *is*
  conveying, and §4 would then require notices and a way for a recipient to
  relink or replace the library.
- **What would change the answer:** shipping a self-hosted or on-prem build
  to a contractor, an Electron or native app that bundles it, or moving
  decode into the browser. Any of those makes §4 apply.
- **A separate question the licence does not cover:** HEVC is patent
  encumbered, which is why sharp's prebuilt binaries ship without HEIF at
  all. Patent licensing for decoding HEVC server-side is a commercial
  question for whoever signs, not a copyright one, and no amount of reading
  the LGPL answers it.

The practical reading is that this is fine as deployed and cheap to keep
fine: keep the decode server-side, keep the library unmodified, and keep
the licence files that ship in the package. **Decided: accepted** on that
reading. The three things that would reverse it are in the table above, and
the HEVC patent question is separate, unanswered by any of this, and
belongs to whoever signs.

## Putting it in front of people

The tenth session added no features. It closed the one gap that made
deploying irresponsible, wrote the deployment artifact, and found two bugs
that only exist in a production build.

### Ten anonymous routes, and nothing metered

Anonymous is correct — §2's thesis is no address and no form, and
`lib/storage/index.ts` documents why the customer photo read is open to
whoever holds the project UUID. Anonymous *plus unmetered* was the problem:
`POST /api/projects` accepts 25 MB and then spends ~1.5 s of CPU-bound,
pure-JavaScript image decode on it, `POST /api/vision` spends a metered
Anthropic call, and a loop over either needs no skill to write.

`lib/ratelimit/` is per-IP token buckets, checked in `middleware.ts`
**before a handler sees the request** — which is the whole point of putting
it at the edge: a refusal never buffers the body and never wakes the
decoder. A limit inside the handler would have paid most of the bill before
saying no.

- **Burst and sustained are separate numbers.** A customer taps six things
  in three seconds and then stops; a limiter modelling only the sustained
  rate either refuses that customer or lets an attacker run flat out.
- **Budgets are a table with tests** (`lib/ratelimit/policy.ts`), tightest
  on upload and vision, comfortable on `/api/price` because it fires on
  every material swap, and each route in its own namespace so spending one
  budget never spends another.
- **A refusal costs no token**, so a retry loop cannot push its own recovery
  further away. `Retry-After` says when to come back and the body says
  nothing else — a limiter that explains itself can be measured and stepped
  around.
- **Which header the address comes from is the security decision**, not a
  detail: a header the client can set is a budget the client can reset.
  Single-valued proxy headers first, `x-forwarded-for` leftmost as the
  fallback (the *rightmost* entry behind a CDN is the CDN, and bucketing on
  it would put every customer in the world in one bucket), IPv6 bucketed by
  /64 because that is the subscriber. Set
  `RATE_LIMIT_CLIENT_IP_HEADER` in production and it stops guessing.
- **Memory is bounded** — least-recently-seen keys are evicted, so a flood
  from many addresses cannot turn the limiter into the leak.
- **Not distributed, deliberately.** State is per instance, so *N* machines
  multiply every budget by *N*: a factor of two on two machines, and a
  reason to reach for the platform's own limiter (or Cloudflare's) before
  reaching for a Redis. `docs/deploy.md` §10 has the order to try things in.
- **Tested in process**, no server and no network, the way the rest of the
  suite works: `lib/ratelimit/__tests__/middleware.test.ts` hammers the real
  middleware and asserts that it sheds load, that a second address is
  unaffected mid-flood, and that one customer's whole session — upload,
  segment, twelve swaps, draw, submit — never touches a limit.

Verified against the production build as well: six uploads then `429` with
`Retry-After: 20`, eight vision calls then `429`, a second address unaffected,
the health check and the landing page untouched.

**Anonymity was not weakened to get there.** A login on `/start` would
delete the product.

### The aerial leg is licensed, not built

`lib/locate/gate.ts` turns the two licensing decisions above into a gate.
Until both the imagery and geocoder terms are declared `permitted`,
`/design/[projectId]/locate` redirects back to the design, `POST
/api/geocode` and the drawing routes answer 404, and the price rail does not
offer the button. Anything unrecognised — including unset — is `unreviewed`,
which is off; there is deliberately no way to force the leg on without
naming a term somebody signed.

The rest of the funnel does not need it, and that is asserted rather than
assumed: `lib/locate/__tests__/gate.test.ts` drives a design, a typology
band, a declined address and a submitted lead with the leg gated off, and
checks the frozen snapshot leaks nothing.

### Two bugs that only exist in a production build

Both were found by running the real artifact rather than the test suite,
and both would have been live on day one.

- **Every redirect in `middleware.ts` pointed at `localhost`.** In a
  self-hosted Next server the URL middleware sees is built from the
  process's own hostname and port, not from the `Host` header the browser
  sent, so the documented `NextResponse.redirect(new URL(path, request.url))`
  produces `Location: http://localhost:8080/login` behind any proxy. The
  signed-out console redirect had been carrying this since the auth
  session. Both redirects now reconstruct the host from the request.
- **One matcher entry with a named parameter matched every path in the
  app.** Adding `"/design/:projectId/locate"` to the middleware matcher made
  Next hand the middleware every request, and everything it did not
  recognise fell through to the console's login redirect — including the
  landing page, which redirected to `/login`, which redirected to `/login`.
  `npm run shots` caught it in one run (`ERR_TOO_MANY_REDIRECTS`) and the
  unit tests could not, because they call the middleware directly and never
  see the matcher. The fix is both halves: matcher entries name a subtree
  and nothing else, and the middleware now decides what is console by an
  explicit prefix list, so it is correct even when handed a path it was not
  meant to see.

### What ships and where

- `Dockerfile` — three stages, `output: "standalone"`, no `node_modules` in
  the runtime image, running as a non-root user. Nothing in it is
  Fly-specific: it is `node server.js` on `$PORT`.
- `render.yaml` — the free path: Render's free instance (no card), Neon's
  free Postgres (no card), photos in `photo_objects` rows rather than a
  bucket, and a GitHub Action (`.github/workflows/database-setup.yml`) that
  runs the migrations, the seed and the first admin account, so a
  deployment needs no laptop at all. What free costs is written down rather
  than glossed: 0.1 CPU against a decode that wants a whole one, a
  spin-down after 15 idle minutes, and a database with no real backup
  retention. It is a demo real customers can use, not the product.
- `fly.toml` — the paid path: Fly.io, Chicago, one always-on machine
  (auto-stop would spend part of the thirty seconds on a cold start), 2 GB
  because `lib/image/limits.ts` admits an 80-megapixel photo, and
  concurrency limits that tell the truth about a decode that blocks the
  event loop for 1.5 s.
- **Why not Vercel**, the obvious answer for a Next app: its serverless
  functions cap a request body at 4.5 MB and `MAX_UPLOAD_BYTES` is 25 MB.
  The iPhone upload path — the entry to the whole funnel — would fail
  outright. Checked before committing to a platform, which is the only time
  that number is cheap to discover.
- `package.json` now pins `engines.node` and `packageManager`; there is a
  `.nvmrc`. The deployment should not discover its Node version by accident.
- **The site's own address is a build-time value**, and finding that out is
  the third bug this session caught by running the real artifact:
  `metadataBase` and `/robots.txt` are both prerendered, so a hostname set
  on a dashboard after the build is silently ignored and every Open Graph
  URL published says `http://localhost:3000`. `lib/site/url.ts` resolves it
  from `SITE_URL`, the older `NEXT_PUBLIC_SITE_URL`, or whatever the host
  already knows about itself — and says plainly, where somebody will read
  it, that the value has to be present when the image is built.
- `app/api/health/route.ts` — liveness only, deliberately shallow, and
  exempt from rate limiting so a flood cannot make the deployment look
  unhealthy and get itself restarted.
- `next.config.ts` — `X-Frame-Options`, `nosniff`, a referrer policy and
  HSTS. A real Content-Security-Policy is written down as a gap rather than
  half-added.
- **Indexing:** `/` is indexable and everything else stays `noindex`
  (`app/robots.ts` and the per-page metadata agree). A `/design/<uuid>` in a
  search index is a privacy incident, not a ranking problem; a marketing
  page nobody can find is not in front of real people.
- [`docs/deploy.md`](./docs/deploy.md) — the runbook: what to provision,
  what has to be set, the first deploy in order, backups and a restore
  drill (`measurement_deltas` is the one loss this product cannot absorb),
  where logs go, and the smoke tests to run against the deployment before
  anyone is given the address.

## Two minutes, a ring of old mulch, and grey paint

Three things the owner asked for after looking at a real yard on a real
screen. They are unrelated in the code and identical in kind: each is a
place where the product knew something true and showed the customer
something else.

### The wait was designed for six seconds and takes a hundred and fifty

The vision call runs 55–170 seconds. What filled that time was a band of
light travelling down the photograph, three grey placeholder pills, and
the words "a few seconds". It was written before anyone had timed the
call, and for six seconds it is the right idea — the customer's own
photograph, visibly being read. For two and a half minutes it says
nothing about whether anything is happening, how far along it is, or how
much longer it will be, and a customer who cannot tell working from hung
either reloads or leaves.

**What is on the screen now is a report, not an animation.** The two
vision passes are a real sequence, and the route records the transition
between them as it happens: `segmentation_progress` on the project
(migration 0008) carries when the wait started, which pass is running,
what it was estimated to cost, what the first pass actually took, and the
region names it found. The design page polls that every 2.5 seconds while
its own POST sits open for the duration. So the tick against "finding the
lawn, beds and hardscape" appears because the first pass finished, not
because a timer said it should have — and when the outline work is still a
minute away, the customer already has `Front lawn · Bed along front walk ·
Foundation planting` on screen in their own yard's words.

**The estimate.** `lib/vision/estimate.ts` sizes the wait from the stored
photo's pixel count, read out of its header by `lib/image/dimensions.ts`
rather than by decoding it — a second and a half of pure-JS decode on the
critical path of the request whose job is to *start* the call promptly is
not a trade worth making for a countdown. Two of the three coefficients
are fitted to the only measurements that exist, the `[vision]
segmentation …` lines from the last two sessions: 54 s + 10 s per
megapixel puts that 0.2 MP photo's first pass at 56.0 s against 56.2 s
measured, and 1.7× puts its second pass at 95.2 s against 95.6 s.

The per-megapixel term is the one number here that is **a prior rather
than a measurement**, because every photo anybody has run through this has
been a small web image. It is deliberately small, and it was halved once
already during this session after watching what the first version put on
the screen: a coefficient big enough to claim a phone photo takes three
times as long as a web image announced "about 4 minutes left" to a
customer on the strength of no evidence at all. What dominates this call
is output tokens — up to 16,000 of polygon coordinates — and the number of
regions in a yard is set by the yard, not by the pixel count. It is also
calibratable without guessing: every real segmentation now logs
`[vision] estimate 150.1s vs actual 152.3s (+2.2s, 0.20 MP)`, so twenty
real uploads settle that coefficient by arithmetic.

**An estimate will still be wrong sometimes, so the rules in
`lib/design/wait.ts` are about what a wrong estimate is not allowed to
do.** A bar never claims a pass has finished — within a stage it
approaches that stage's share and never arrives, and only the server
moves it across a boundary, so a bar stuck at 47% means the first pass is
genuinely still running. A bar never stalls either: past its estimate it
keeps closing the gap asymptotically, so an overrun looks slow rather
than broken. A countdown that has run out stops predicting and says
"Any moment now", and a long overrun says "Still working. Big photos
take longer — keep this page open and it will finish." Under ninety
seconds it becomes a real ticking `1:20`, because by then it is derived
from the first pass's *measured* time rather than from a pixel count.

**And a reload during the wait no longer buys a second vision call.** It
used to: a pending segmentation was indistinguishable from an unstarted
one, so the impatient customer's refresh — at minute one of two — started
a whole second metered call for an answer the first one was already
producing. A segmentation that has reported progress inside the last six
minutes is running somewhere, and a tab that finds one watches instead of
starting one. Past six minutes it is presumed dead and this tab takes it
on.

**How to look at it without a key.** Segmentation with no
`ANTHROPIC_API_KEY` answers in milliseconds, so the screen a customer
spends most of their first visit looking at was the one surface `npm run
shots` could never reach. It reaches it now: `design-wait-reading`,
`design-wait-refining` and `design-wait-overdue` at both viewports, driven
by answering the design page's own poll with a pending project. The
overdue state is in there deliberately — "taking longer than usual" is the
state most likely to be seen first by a customer and least likely to be
seen first by us.

### A ring of old mulch around every plant

Swap a bed to granite and every shrub in it sat in a wide brown halo of
the mulch that had just been replaced. On a bed of eight, eight halos.

The mask that keeps gravel off the plants was drawing each cut-out 18%
wider than the plant and then running a Gaussian blur over the whole
group — and a blur softens a shape by growing it, so the hole ended up
around a third wider than the plant it was protecting. The comment above
the constant argued, correctly, that gravel across a shrub's leaves is a
worse failure than a little old bed showing at its base. It was right
about the direction and wrong about the distance.

Both halves are fixed and the reasoning is unchanged. The cut-out is now
**total out to the plant's own reported edge and fades over the next
12%** — a radial gradient in `objectBoundingBox` units, so the stops are
fractions of *each* ellipse and a small perennial and a large yew get a
feather in proportion, with no blur and therefore no growth. Nothing lands
on a leaf; nothing is left unpainted more than a finger's width from one.

The generosity that used to live in that constant now lives where it
belongs: the segmentation prompt already asks the model to cover a plant's
whole visible mass including its outer foliage. That is a claim about the
plant, made by the pass that can see it, rather than a fudge factor
applied equally to every plant by the pass that cannot. The prompt is
deliberately **not** being retuned to compensate — three earlier sessions
went at the prompt on an assumption nobody had checked.

### "It kind of just colors the mulch gray"

Granite chips over dark mulch came out looking like dark mulch someone had
greyed. It was four separate faults compounding, and the last of them was
doing most of the damage:

1. **The filters ran in linearRGB**, the SVG default. Every colour ramp in
   `swatches.tsx` had been tuned against a colour space nobody read it in:
   a table value of 0.28 comes out at sRGB 0.57, about twice as light as
   written. That is why every material landed somewhere between pale grey
   and pale beige whatever its ramp said.
2. **The noise was never spread.** Measured rather than assumed: a
   `feTurbulence` fractalNoise field averaged across its channels lands
   between 0.40 and 0.62, so a colour table indexed 0..1 only ever used
   its middle fifth. Every material was a nearly flat wash of its own mid
   tone.
3. **One generator served six materials.** Same noise type, same octaves,
   same flat treatment, and river rock at 0.07 against granite chips at
   0.09 — a 30% difference in gauge between a 1.5in washed stone and a
   3/8in chip, which is to say the picker offered two swatches of the same
   grey under different names.
4. **The photograph's own grain was multiplied back at full detail.** The
   shading pass desaturated the photo, lifted it, and multiplied it over
   the new material — so every shred of the old mulch, and all of its
   darkness, came straight through the stone. The customer really was
   being shown their own mulch in grey.

Each is fixed at its cause. Filters declare `sRGB`, so a ramp value is the
colour it says it is. A `spread` term maps each generator's measured range
onto the full ramp before colouring. A spec now carries its own grain, its
own gauge and its own treatment: stone is lit, with individual pieces
catching light and washed river rock carrying a specular sheen; mulch is
matte and runs in strands; and a low-frequency mottle keeps twenty feet of
bed from being one flat tone. And the shading pass now blurs the
luminance well past the scale of any material's grain before multiplying
it, so what carries through is the *light* in the photograph — the shadow
under a shrub, the sunlit half of a yard — and none of the material.

| material | gauge | treatment |
|---|---|---|
| Washed river rock | 1.5in, coarsest here | lit hard, wet sheen |
| Granite chips | 3/8in, four times finer | lit, faint sheen |
| Buff limestone | between the two | lit, matte |
| Hardwood / dyed / cedar mulch | strands, not specks | matte, anisotropic grain |

### The stones were the size of dinner plates

The material work above shipped and the next real yard came back looking,
in the owner's words, "a little bit goofy — maybe the scaling or the angle
doesn't match". It was the scaling, and it was not subtle once measured.

A material's grain was a base frequency written as a fraction of the
frame: one period every 29 pixels of a 1600px photo. **That is not a
gauge.** A photo taken from a front walk and one taken across a parking
lot show wildly different amounts of ground in the same 1600 pixels, and
the same constant drew the same stone in both. Against the first bed with
a number on it — 300 sf, from the model's own `estimated_area_sf` — the
arithmetic is:

| material | physical | drawn | |
|---|---|---|---|
| Washed river rock, 1.5in | 2.5 px | 29 px | ~12× life size |
| Buff limestone, 3/4in | 1.2 px | 29 px | ~23× |
| Granite chips, 3/8in | 0.6 px | 29 px | ~46× |

Twelve times life size is a 1.5 inch stone drawn eighteen inches across.
Nothing about the colour was wrong; the customer was looking at a bed of
boulders, and a person reads that instantly without being able to name it.

**The photograph carries a ruler already.** The segmentation reports
`estimated_area_sf` for every region — the model's honest guess from door
widths, siding courses, walkway widths — and against the polygon's area in
pixels that is a scale: √(px² ÷ sf) pixels to the foot. Failing that, the
plant ellipses are a ruler of last resort, because a shrub in a front bed
is about three feet across. `lib/design/scale.ts` is those two rulers, a
plausibility range that refuses a nonsense answer rather than believing
it, and an assumed forty-foot frame for a region that carries neither.

Using a QA-only number to *draw* with is worth stating plainly: it stays
un-billable, unshown and unpriced, and §1's "the image is a view, never
the artifact" is exactly the licence. A rough scale is the right input to
a picture and the wrong input to an invoice.

**The gauge is compressed, not scaled, and that is deliberate.** A 3/8in
chip in a bed photographed from the street is half a pixel across:
physically correct and useless, because the customer is choosing between
granite chips and river rock and the picture has to show a difference. So
the drawn gauge is `3 · physical^0.6`, which keeps the ordering — river
rock coarser than limestone coarser than granite, always — while lifting
the fine end into visibility and holding the coarse end far below the 29px
that caused this. A test asserts that nothing, at any distance or any
gauge, can reach it again.

**And the lighting had to go.** The previous pass built river rock out of
`feDiffuseLighting` over the noise, with a specular sheen — genuinely
good-looking at the old enormous gauge, and impossible at the correct one.
`feDiffuseLighting` derives its normals from a fixed **three-pixel**
kernel, so it is not scale-invariant: measured, it spans 0.43–0.84 of the
range at a 20px gauge and collapses to 0.63–0.71 at 5px, which is the flat
wash the ramps were retuned to escape.

Swatches in the picker are unaffected by any of this: a swatch is a macro
shot, nine inches across the square, so a 1.5in stone is a stone and a
3/8in chip is a chip at the ratio they actually differ by. Drawing a
swatch at the photograph's gauge would make every one of them the same
grey square.

### "Tell me that looks like real river rock"

It did not. Four faults in the material pipeline had been found and fixed
— the colour space, the unspread noise, one generator serving six
materials, the gauge — and a bed of washed river rock on a real parking
lot still came back as flat grey weave with darker blotches in it. The
report was one sentence and it was right.

The fifth fault was underneath all four:

> **Turbulence is a cloud. Gravel is objects.**

A noise field is continuous. It has no edges, so it has no pieces, so
whatever colour and contrast it is given it reads as *fabric*. That is why
every material in the app had the same character however differently it
was tuned, and why removing the lighting — correct, for the reason above —
took the last thing that had been faking individual stones. What was
missing was never tone. It is that a stone has an outline, its neighbour
has a different outline, and there is a shadow in the gap between them.

So `lib/design/grains.ts` draws the pieces. A jittered field of grains at
the material's own gauge, each with its own size, rotation and tone, over
a ground darker than the darkest piece — because what shows between two
stones is the shadow down the gap, not more stone. Three shapes, because
three things behave differently in a bed:

| shape | material | why |
|---|---|---|
| **pebble** | washed river rock | tumbled, so rounded; and a wide tone spread, because a load of it is grey and buff and near-white mixed together |
| **chip** | crushed granite, buff limestone | angular facets with flat faces, and out of one quarry, so far closer in tone than washed rock |
| **strand** | hardwood, dyed, cedar mulch | long, thin, lying every which way, with far more overlap than stone |

The sheen came back with them, at a scale that survives being drawn small:
one shared radial gradient painted over each pebble, which is what makes a
stone read as round rather than as a grey blob. It is a property of the
piece now, not of a three-pixel kernel, so it looks the same at any gauge.

Three things went wrong on the way and each set a constant:

**A tile repeats, and the eye finds it.** A few hundred pixels of stone
across a few thousand pixels of bed is six copies of one arrangement, and
it read as wallpaper on a bed-width strip. The fix is a second layer of
the same material on a tile at 0.71 of the first — not a round fraction on
purpose, because a tile at half or a third lines up every two or three
repeats and buys nothing. Two periods that never meet have a combined
period longer than any bed.

**Evenness in value is worth nothing if it buys structure in space.** An
attempt to spread the tones evenly rather than randomly — stepping by the
golden ratio, which fills 0..1 better than any random draw — put a bed of
gravel in vertical stripes, because pieces are generated in lattice order
and the index that walked the tones was also the position.

**A tile barely longer than the piece in it *is* the motif.** Spacing was
a multiple of a piece's width, which for a shred five times longer than it
is wide meant a tile of two shred-lengths. A bed of mulch came out as
visible houndstooth. Spacing is a multiple of the piece's *longest*
dimension now, and a tile is at least six pieces across.

Judged on a contact sheet of every material at the two gauges a real photo
produces — a bed twelve feet off the camera and one forty — plus a
bed-width strip of each to check for a repeat, and then on the app itself.

**The angle, which was the other half of that report, is fixed below** —
it was worth measuring on a real photo before building anything, and the
real photo said it mattered more than four or five pixels a stone
suggested.

### A bed of one stone size, edge to edge

The gauge fix above got the *average* size of a stone right and drew it at
that one size from the front of a bed to the back. A bed does not work
that way: it recedes. On the first real photograph the stones at the lawn
edge came out the same size as the stones six feet further in, and the
result reads as carpet laid over the picture rather than as ground going
away from you. This is the other half of the same report — *"maybe the
scaling or the angle doesn't match"*.

**The photograph already carries the answer, and it costs nothing to
read.** There is no camera model here, no focal length, no height, and
there does not need to be. The segmentation reports the plants standing in
a region as ellipses, and shrubs in one bed are roughly one size in the
world — so how fast their drawn size falls off up the frame *is* the
perspective. Under a pinhole camera looking at a ground plane, a thing of
fixed real size appears with a height proportional to its distance below
the horizon, so a least-squares line through (centre row, radius) and the
row where it crosses zero is the horizon.

On the first bed this ran against — ten plants, three tulip clumps and
seven boxwoods — it put the horizon at 0.26 of frame height, which lands
on the porch floor line where a standing photographer's eye level belongs.
Across that bed it asks for stones 0.64× at the back and 1.36× at the
front, a little over two to one.

`lib/design/perspective.ts` refuses more cases than it accepts, on
purpose: fewer than three plants, all at one depth, or a line that says
things grow as they recede, and the region gets one gauge exactly as
before. A wrong perspective is far worse than none, and the scale it does
hand back is clamped either way.

**The material is drawn in three bands, and they crossfade.** Rows of a
photograph are lines of equal depth on a ground plane, so a horizontal
slice is the right shape — but slicing with a hard edge puts a visible
straight line across the bed where the stone size steps, which is what the
first render showed. Each band fades in over the one above it and is
opaque from there down; fading *in* only, never out, because two bands
that both fade would leave the photograph showing through the middle of
the crossfade where neither is opaque.

Bands cost nothing in geometry. The pieces are built once per material as
a `<g>` in the defs and each band is a `<pattern>` containing a `<use>` of
it with a `patternTransform` scale — one set of a thousand stones, three
tiles.

### Why a drawn bed looked drawn

Two more faults surfaced on the same photograph, and the control that
found them was hardwood mulch drawn over a bed of real hardwood mulch:

**Nothing had a surface.** Drawing the pieces got the shapes right and
left everything between and across them perfectly clean, which no material
is. A sub-grain a third of a piece across — the wood's own grain, the dust
in the gaps, the dirt on a stone — is multiplied over all of them now, and
the vector edge is taken off each piece with a blur a sixteenth of its
width. A shape cut with a mathematically hard edge is the other half of
why a drawn bed reads as drawn: a photograph of gravel has no such edge
anywhere in it.

**Every piece was the same size.** The size distribution ran 0.72–1.28× of
the gauge, a range narrow enough to read as manufactured. It runs 0.45–2.0
squared now, so most pieces are small and a few are large, which is what
mulch and gravel actually do. Shreds vary in *length* far more than in
thickness — mulch is shredded off a log — and scaling both together turned
the large end of the distribution into blobs.

The ground under the pieces also went from 0.62 of the darkest piece to
0.76. At the distance a yard is photographed from, the gap between two
stones is mostly full of fines and dust rather than shadow, and too dark a
ground makes every piece read as a cut-out sitting on a board.

### A hedge is not seven ovals

The plant cut-out is a black core fading to white at its rim, one per
plant, and they were painted one over the next — so a later one's pale rim
overwrote an earlier one's dark core, and seven boxwoods grown together
into a single hedge came out as seven ovals with pale seams between them.
They are drawn with `darken` inside an isolated group now, which takes the
deeper cut of the two wherever they overlap: the union of cut-outs, which
is what was meant all along.

### Taking the plants out

Until now the only thing a customer could do to a plant was swap it for
another one, which quietly assumed the answer to "where do the plants go"
was "exactly where they are now". Nobody designing a bed thinks that. The
first step out of it is being able to take a plant out at all.

**Clearing is priced, because clearing is work.** The crew digs each shrub
up and hauls it away, and a design that shows eight of them gone without
bidding their removal hands the contractor a quote they lose money on. The
`shrub_removal` assembly — "existing shrub removal and disposal", per
EA — was already in the seed book and already in the foundation-refresh
recipe before anything could select it, so a removal prices through the
same engine as every other choice: one EA per plant, the count coming from
the photo, the scope line reading "3 existing plants taken out" in the
customer's words rather than the assembly's.

The same guardrail the plant catalog lives under applies (§1: nothing may
be selected that the engine cannot price). The engine throws on an
assembly the org's book does not hold, so `/api/plants` now answers
`canRemove` alongside the catalog, the design page does not draw the
control without it, and the route refuses the write. Putting plants *back*
is always allowed — it can only ever subtract a line item.

**Replacing a plant and removing it are one decision, and the database
says so.** They are the same slot: a design holding both for one shrub
would bill the crew twice for digging up the same plant, and every reader
downstream would have to arbitrate. So `plant_selections` holds one row
per decided plant with a check constraint —
`(option_id is not null) <> removed` — and choosing a replacement
un-removes the plant while clearing it drops the replacement. Migration
0009.

**What fills the hole is the photograph.** The first answer to this was to
stop treating a cleared bed as a photograph and repaint it whole in the
material the model said was already there. Tested against a real yard it
was wrong twice over, and the report was blunt: *"it basically just paints
over the plant with a bed that I don't choose, but then anything outside of
that bed that gets removed does not actually get removed... it looks like
we're filling in with MS Paint."*

Both halves of that are the same mistake. A repaint changes everything the
customer was looking at in order to fix the one thing they asked about, and
a material fill is clipped to the region outline while a shrub is not: the
half of it standing against the brick, or leaning over the lawn, survived.
`lib/design/existingSurface.ts` and the repaint went with it.

So the hole is **clone-stamped** — filled with the picture's own pixels,
the way a retoucher would. Nothing else on the photograph is touched, and
because the hole is the plant's ellipse rather than the bed, it reaches
wherever the plant did.

The obvious clone stamp is to draw the whole photograph shifted by a
plant's width and let what was beside the shrub land where the shrub was.
That was built, and it ghosted on the first render, for two reasons that
turn out to be the same arithmetic:

- **A shift shorter than the hole samples the hole.** Sliding by a
  plant-and-a-half leaves a third of the hole reading its own pixels, so
  the shrub was removed and a blurred shrub appeared in its place. Nothing
  shorter than twice the hole works, in any direction.
- **Twice the hole leaves the bed.** A foundation planting is a strip about
  as tall as the shrubs standing in it, spaced about their own width apart.
  Two hole-heights up is the brick, two down is the lawn, two sideways is
  the next shrub. There is no direction with a whole hole's worth of clean
  bed in it — which is why the first render filled a mulch bed with brick
  and lawn and a copy of the neighbouring shrub.

`lib/design/inpaint.ts` answers it with a **patch** instead of a shift. It
searches the region for the largest piece of ground that is inside the
outline and clear of every plant — including the plants that are also
coming out, or one hole fills from another — preferring one near the hole,
and tiles it across. Mulch, gravel and turf are stochastic, so a repeat
reads as more of the same material rather than as a pattern; and a patch
small enough to fit between two shrubs still exists in beds where no
whole-hole donor does.

The slices of a plant that were **never over the bed** are filled
separately, because filling them with mulch is the repaint's mistake
again. The part of the hole above the outline is sampled from further
above and the part below it from further below, far enough to clear the
hole: brick stays brick, lawn stays lawn, sky stays sky.

**A patch has to be near, and it has to be big enough.** The first real
bed put both to the test at once. One hole came back as a stamped
rectangle with visible hatching in it: the search had found a thumbnail of
clean mulch between two shrubs and tiled it six times across the hole.
Another came back bright: the preference for a bigger patch had reached
across the bed to grab a piece of the sunlit half for a hole in the shade.

Both are fixed at their cause and neither by refusing to fill. A patch too
small is **magnified rather than repeated more often** — ground blown up
to twice its size is still ground, ground stamped six times is a pattern —
capped at three, past which the softness shows against the sharp bed
around it. And a patch is taken from within a sixth of the frame where the
region has one that near, because bigger is better only while the light is
the same light, and near is the only proxy for that available.

One asymmetry is worth stating because it sets a constant. Cutting the
hole wider than the plant costs a ring of clean bed, which is refilled
with clean bed and cannot be seen; cutting it narrower leaves a rim of
shrub standing around the fill, which is the whole complaint. So the hole
is cut generously — a segmentation that under-sizes an ellipse is an
ordinary failure and this is what absorbs it — and narrowed only where it
would otherwise reach a plant the customer is keeping.

### Moving a plant that is already there

Swapping a plant and taking one out both still assumed the answer to
"where do the plants go" is "exactly where they are now". The third verb is
the same plant, somewhere else in the same bed.

**There is no mode.** The plants on the photo are draggable, always: put a
finger on the shrub and move it. A first pass put that behind a "Move the
plants" toggle and it was wrong — a toggle is a thing to find and turn on
before the direct thing works, which is the opposite of direct. Press and
lift opens the picker, press and travel moves the plant, and a threshold in
`PhotoCanvas` is where the two part company. `PlantMoveControls` keeps the
paths a drag cannot serve: arrow keys and a screen reader, a nudge for a
thumb that got it roughly right, and a way back for one plant or all of
them.

**A drop is confined server-side**, in `lib/design/plantPlacement.ts`,
before the write. A plant dragged onto the driveway is not a design, it is
a mistake nobody notices until a rep is standing in the yard — and a
browser can be told anything, while the outline is what the crew will work
to. The confinement is a nudge and not a rejection: a drop a little outside
the bed is what a fingertip on a phone does, and refusing it would read as
the drag not working, so it lands on the nearest point inside instead.

**Moving is priced, because moving is work.** A `shrub_transplant`
assembly — lift the plant intact, dig and amend the new hole, set and water
— is one EA per plant moved, gated behind the same `canMove` handshake as a
removal so nothing can be selected that the engine cannot price. Where a
plant is moved *and* replaced, both are billed: the crew lifts what is
standing there whatever goes back in. A drag that ends where it started is
not a move and bills nothing.

The old spot is a hole like any other, so it is clone-stamped shut before
the plant is stamped down in its new one.

### Putting a plant in where there was none

Three verbs shipped before this one — swap a plant, take one out, move
one — and all three are *about* a plant the camera happened to see.
Together they are a rearrangement. Nobody planning a bed only ever wants a
plant exactly where a plant already is, so until a customer could put one
in an empty spot the design was still a reading of the photograph rather
than a design.

**It prices as the install it is.** One `install_<sku>` at quantity 1 EA —
the same assembly a swap bills, off the same catalog, through the same
engine. There is nothing to remove and nothing to lift, so no other line
appears, and `plantAssemblyCounts` now takes anything carrying an option
because a plant put in where one stood and a plant put in where none did
are the same install. Only the reason differs, and the reason is a scope
line rather than a price.

**Three guardrails, and the route trusts the browser for none of them.**
The option id is resolved against the catalog derived from the org's own
book, so an id a browser made up buys nothing. *Which bed it landed in* is
resolved from the outlines on the server — the photograph has a texture, a
mask and a handful of buttons on top of it and none of those are the
design — and a drop that finds no bed adds nothing. And the plant is
checked against the catalog **for that region**, so the rule that refuses
a shade tree against the house holds whether or not the palette that
offered it was filtered. A drop a little outside a bed still finds it, for
the same reason `confineToRegion` nudges rather than refuses.

**It is drawn at the size it grows to.** The catalog carries
`matureSpreadFt`, the photograph carries a scale and now a perspective, so
a five-foot viburnum dropped at the front of a bed is drawn five feet
across at the front of that bed and a smaller one further back is drawn
smaller. That is the whole reason to drop a plant on a photograph rather
than pick it off a list: the customer finds out it will not fit before a
crew plants it. On the first real bed this ran against, an arborvitae
dropped near the lawn edge came out overhanging the grass — which is
exactly what a ten-foot arborvitae in a twelve-foot bed does.

**Dragging is not the only way in.** The gesture is the obvious one and
the palette owns all of it: a pointer that starts on a chip and ends over
the photograph belongs to neither component, so the chip keeps the moves
coming and the drop asks the document what is under it. But a drag is the
one interaction a keyboard cannot make, so every chip is also a real
button — activating it drops the plant in the middle of the open bed, and
the nudges take it from there. That is the only path a screen reader has,
so it has to actually work, and it does.

### What none of this has been through

There is still no `ANTHROPIC_API_KEY` in this container, so:

- **The two-pass progress has never run against a real vision call.** The
  stage transition, the found names and the `estimate vs actual` line are
  exercised by unit tests and by faked wire responses, not by a call that
  took two minutes. The first real upload is the acceptance test.
- **The materials were judged against a synthetic yard**, generated to
  match `lib/vision/demo.ts` so the demo overlay lands on plausible
  ground: dark mulch under the beds, green masses where the demo puts its
  plants, concrete on the walk. It answers "does granite still look like
  greyed mulch" and it cannot answer how any of this sits on a real
  photograph in real light. The gauge fix above came out of a real one and
  has not been back through a real one.
- **The per-megapixel coefficient is still a prior.** See above; the log
  line is how it stops being one.
- **A cleared bed has only been seen against a synthetic photo.** On the
  synthetic yard the fill is indistinguishable from the bed around it, but
  that yard's mulch is flat: no shadow across it, no sun on one end. A
  tiled patch on a real photograph will carry whatever light was on the
  patch, and how visible that is on a bed with a shadow falling across it
  is the thing to look at first on the next real yard.
- **The materials have been seen on one real yard and reworked against it, and mulch is still the weakest of them.** Stone reads as stone; shredded mulch drawn over a bed of real shredded mulch is close but softer and more even than the thing beside it. Every other material in the picker is judged against a contact sheet rather than against its own photograph.
- **An added plant is a glyph, not a photograph.** A moved plant is drawn
  with its own pixels; an added one has no pixels to draw with, so it is
  the same flat catalog glyph the swap path uses, and it does not pick up
  the light of the yard the way a swapped material now does. It reads as a
  plan symbol standing on a photo rather than as a plant.
- **The perspective is fitted, not measured.** The horizon comes off a least-squares line through the plant ellipses, which assumes the plants in one bed are roughly one size in the world. A bed with a specimen tree at the back and groundcover at the front will fit a horizon that is wrong; the module refuses the obviously bad cases and clamps the rest, so the failure is a bed drawn flat rather than a bed drawn wrong. A region with fewer than three plants gets no perspective at all.
- **The hole is only ever as big as the model says the plant is.** On a
  test photo drawn with shrubs deliberately larger than the segmentation's
  ellipses, the fill lands correctly and a ring of shrub remains around it,
  because that is where the plant was reported to end. The generous cut
  absorbs a small under-estimate and cannot absorb a large one; the fix for
  a large one belongs in the segmentation, not here.

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

## Plug-and-play plants

Tap a plant on your own photo, see what it is, put a different one there,
and watch the range move. The unit of choice is **one plant** — swapping
the boxwood by the door leaves the four shrubs beside it exactly as they
are, which is what makes this different from swapping a bed's surface.

### Most of it already existed

The previous session's README said this was blocked on seed data. **That
was wrong, and worth correcting rather than quietly fixing**: the seed
carries ~20 plant SKUs with the full section 3.5 metadata — install size,
mature height and spread, growth-rate class, form, hardiness zone,
deciduous vs evergreen — because the time slider could not have shipped
without it. And `seed/pricebook.seed.ts` already builds an
`install_<sku>` assembly for every one of them: the plant, its soil, crew
time from its size class, and a skidsteer where the size class needs one.
Pricing a single-plant swap was a solved problem nobody had called.

What was missing was the path between them.

### The catalog is derived, not written

`lib/catalog/plants.ts` builds the offerable list from the org's own price
book: a plant is offerable exactly when the book holds a cost item for it,
an install assembly that plants it, and the metadata to say how big it
gets. Nothing is hardcoded, which makes the guardrail structural rather
than asserted — remove the assembly and the offer disappears, with no list
to remember to edit. A contractor who adds a plant at `/pricebook` can
offer it without a deploy.

It is served from `GET /api/plants` rather than bundled, because the price
book is editable and revisioned and a list compiled into the browser goes
stale the moment somebody publishes. **It carries no cost, rate or
margin** — a test asserts that, because this list is the newest thing to
cross the disclosure boundary in section 1.

Two rules the catalog enforces on its own:

- **No tree against the house.** A 40-foot maple two feet from the siding
  is a callback, not a design, so `foundation_planting` regions are
  offered everything except trees. The route enforces it too — the browser
  is not what decides this.
- **Nothing offerable is unpriceable.** An option id a browser invented,
  or one for a plant this contractor stopped stocking, buys nothing at the
  route and prices nothing in the engine.

### What a choice is worth

One plant swapped is `install_<sku>` at 1 EA, with provenance `photo` —
the plant is in the estimate because the segmentation found it standing
there. Those line items reach the rep's quote like any other, and the
plant's name reaches the customer's scope list, counted rather than
repeated ("3 × Boxwood 'Green Velvet'", because three identical lines is
what a bug looks like).

Replanting is a job type in its own right, so **a customer who only swaps
plants still gets a band and can still send the design**: against the
house it prices as a foundation refresh, in a bed as bed renovation. Both
distributions already existed. The band is still typology — "projects like
this typically run" — so one daylily shows the range for the job a
contractor would actually roll a truck for, which is the honest answer
even though it is not the intuitive one.

A stored choice is resolved against the **current** segmentation every
time it is read. Re-segmenting a photo produces new plants and can leave a
choice pointing at one that no longer exists; that choice is ignored, never
priced. Nothing puts a line item on a rep's quote for a shrub nobody can
point at.

### Drawn, not pasted

A swapped plant is an SVG shape generated from the catalog entry
(`components/configurator/plantGlyphs.tsx`) — five habits, because that is
what the catalog distinguishes and what reads differently at a glance on a
phone. Not a photograph of that plant composited into the yard: section 1
says the image is a view and never the artifact, and the same rule that
makes a swapped surface a generated texture makes a swapped plant a
generated shape.

It is scaled to the footprint the photo's plant occupies. We know where
the plant is and how big it looks from here, and a single photograph gives
no scale in feet — so the picture says "this plant, here" and the picker
says how big it gets, on every row, before the customer picks four of them
for a two-foot gap.

The mask changed with it: a plant that is **staying** is punched out of
the material so the photograph shows through, and a plant that has been
**replaced** is covered by the material and drawn over, so a swap reads as
the old plant coming out rather than being hidden.

### Reaching a plant

The ellipses on the photo are a pointer affordance and are hidden from
assistive technology — a shape has no accessible name, and four shrubs in
one bed on a 390px photo overlap enough to steal each other's taps. The
accessible path is a **plant strip** in the picker panel: real buttons, in
document order, 44px, no overlap. Exactly the split the region markers and
the region strip already use, for exactly the same reasons.

Two things the browser pass caught that review would not have:

- **A region's name pill swallowed the taps of the plants underneath it.**
  Between the two the plant is the more specific target, so the plant layer
  now stacks above the labels; the region is still reachable from anywhere
  else in its polygon and from the strip under the photo.
- **A `<fieldset>` pushed the whole 390px page sideways** — 511px of
  horizontal scroll from one plant list. A fieldset takes its minimum width
  from its contents and ignores the grid track it sits in unless it is told
  `min-width: 0`. It is the only fieldset in the app and it now carries the
  fix and the reason.

### Still open

Swapping a plant does not move the band beyond its job type, because the
band is typology until something is measured — that is the existing
architecture, not a plant-specific gap, and it closes when the aerial leg
does. The spacing validation in `lib/growth/spacing.ts` knows how to warn
about crowding at year five and is not wired to this yet: it needs a scale
in feet, which one photograph cannot give.

## Found it: the second pass was moving the ground

`npm run segment` was run on the raised-bed photo the moment it existed,
and the four pictures answered the question in one upload.

**Stage 1 was good.** The model returned a 27-vertex outline covering 25.5%
of the frame that follows the lava-rock bed properly — along the house, down
the right, around the capstones and back. It also read the yard correctly:
`black lava rock / crushed volcanic stone`, a `retaining_wall` at 0.95
confidence, a `raised_bed` at 0.85, six plants in roughly the right places.
The recognition was never the problem.

**Stage 2 changed nothing.** The first pass's ground line was applied and
moved one vertex by 0.004. The clamp — my leading suspect, and the thing I
would have "fixed" if I had guessed instead of measured — was innocent.

**Stage 3 destroyed it.** That same bed came out of the second look as
**0.2% of the frame**: a ribbon along the base of the wall with a spike up
the left side. Every y-value in it lands on a smooth interpolated curve,
which is the signature of `groundYAt`, not of a model's round numbers.

`mergeRefinement` ended with this line:

```ts
return holdRegionsToGround(merged, refined.groundLine);
```

The refinement prompt asked for `ground_line` a second time, on the theory
that a pass which had seen where its outlines fell was better placed to say
where the ground is. Looking at a photo with coloured lines drawn all over
it, the second pass put the ground line along the **bottom edge of the
picture** — `groundYAt(0.5) ≈ 0.945`. Every region was then pulled down onto
it. The customer saw a scribble where their bed was.

Replayed as a unit test: a bed at 25.5% of frame, a refinement well inside
the merge bounds, and a bottom-of-frame ground line → 0.0% area, top edge
0.875, and the tally still reporting `1/1 kept`. Exactly the real numbers.

**The fix is one line, and it is the module's own principle.** Everything
except shape belongs to the pass that saw the clean photograph — the merge
already refuses to let a refinement change a region's kind, label, material
or confidence for precisely this reason. A ground line is emphatically one
of those things. `mergeRefinement` now returns `merged`. The refinement
prompt no longer asks for a ground line, which also takes output tokens off
the critical path, and a `ground_line` a model volunteers anyway is read and
dropped.

### What the quorum could not have done

The obvious follow-up is to widen the quorum in `groundLine.ts` so a
disastrous line gets thrown out. **It would not have helped, and every
version tried against the real data made things worse.**

The count-based quorum only notices regions flattened to *nothing*, so it
was never going to fire here. But an area-based one does not fire either:
of the four regions, only the bed was gutted — the walk kept 77% of its
area, the strip 81%, and the lawn actually grew. One gutted region among
three mildly-trimmed ones is *exactly* the outlier the clamp exists to
correct, and no threshold separates the two cases. An area quorum tight
enough to catch this also discarded the legitimate single-bed-up-the-wall
line that the whole feature was built for — it broke two existing tests on
the first run, which is how that got caught.

So the quorum is unchanged and its docblock now says plainly what it does
and does not cover. The lesson was not that the last guard needs widening;
it was that a bad ground line must not reach it.

### The other number

The first pass took **56.2 seconds** and the second **95.6 seconds** — 152
seconds against section 2's thirty, on a 410×487 image. That is the first
time this call has ever been measured, by the timing line added a commit
earlier. Turning the second pass off is now strictly better on both axes:
the outlines are the good stage-1 ones and the wait drops by 95 seconds.
`VISION_REFINE=off` does it without touching code.

The remaining leg has since measured 56.2 s, 75.5 s and 68.8 s across three
runs on the same photo. That is around twice section 2's budget, and
16,000 max output tokens of polygon coordinates is most of it.

**The owner has decided that trade deliberately: the accuracy is worth the
wait.** Do not "fix" this without asking. §2's thirty seconds was written
before anyone had measured a vision call or seen what one buys, and the
levers that would close it — a faster model, fewer vertices, dropping the
fields the prompt asks for — all pay for it in exactly the thing the last
three sessions were spent recovering. If it is revisited, it is revisited
with `npm run segment` run against both options and the two `01-model.jpg`
compared, not by reasoning about token counts.

What the wait needs is honesty on the customer's side, not removal: a
minute is a long time to look at a progress bar with no idea whether it is
working.

### The fill, on a yard with narrow regions

A fourth photo had two regions the earlier ones did not: a turf strip at
0.9% of the frame and a walkway at 0.7%, next to a lawn at 31.9%. The
pipeline came through clean — every region within 0.2% end to end — and
then the last line of the report said the material fill was sitting inside
its outline by **33.5% of a region's area**.

The inset is meant to keep a swapped material off the row of cobbles a bed
is edged with. A row of cobbles is a fixed width wherever it appears in the
picture, so the inset was written as a fixed fraction of the frame. Right
for the reason, wrong for the result: the same distance is a rounding error
on a lawn and a demolition on a strip. Swap the material on that walkway
and a third of it would not be painted, which reads as the swap having
failed rather than as a tasteful margin. Long thin regions are not an edge
case here — walkways, edging strips, the grass between a drive and a fence.

`insetForRegion` makes the frame-sized figure a *ceiling* and bounds it by
the region's own width. `area / perimeter` is about half the width of a long
thin region and the natural scale of a fat one, so a small multiple of it
caps the share of area the inset can take whatever the shape. Measured
against the four regions from that photo:

| region | was | now |
|---|---|---|
| lawn, 31.9% of frame | 4.4% | 4.4% |
| mulch bed, 21% | 5.8% | 5.8% |
| turf strip, 0.9% | 80.4% | 6.0% |
| walkway, 0.7% | 80.4% | 6.0% |

The regions that were already fine are byte-identical — the multiple is set
so a region wide enough to give up the full inset still gives it up, because
this must not quietly soften the thing that keeps gravel off a border.

### Plants move with the bed they stand in

With the outlines landing, one thing was left on the brickwork: the plant
rings. `plants 0/0` again, for a different reason each time.

Asked to echo the ids it was given, the same model on the same photograph
returned `plant_1 … plant_8` on one run and `shrub_1 … shrub_8` on the
next — nine plants found, then eight, renamed differently both times. It is
not disobeying an instruction so much as re-describing what it sees. **No
amount of prompt wording fixes that**, and the tail-tolerant id match added
an hour earlier caught the first spelling and not the second.

So the id is a hint now and the geometry is the authority. When a region's
own outline correction is accepted, that correction says where everything
standing in the region went: each plant is carried through the same
bounding-box transform, and a corrected ellipse is claimed for it only if
one landed near where the plant is now expected to be. Checked against the
real response — the transform predicts each of the nine plants to within
0.02–0.07 of the model's own shrubs, which is comfortably enough to match
them without crossing one shrub with another.

**The fallback matters as much as the match.** A plant left where it was
while its region moves ends up *outside its own region*: the mask punches a
hole in nothing, the glyph and its tap target render on the wall behind, and
the customer gets "a couple of weird plants up in the air". That is not
cosmetic — it is a plant nobody can tap and a shrub that gets gravel painted
over it. A plant nothing was offered for is carried by its region's own
transform rather than stranded.

Replayed against the real response: **7 of 9 matched to the model's own
shrubs, 2 carried, none left above the bed.** Was nine out of nine on the
brick. The log line says so too — `plants 7/9 kept (+2 carried)` — because
a carried plant and a corrected one are different facts.

### Where that left it

Run again on the same brick-house photo with everything in place:

| region | 1 model | 2 ground | 3 second look | 4 drawn |
|---|---|---|---|---|
| mulch bed | 12.8% | 12.7% | **20.8%** | 20.7% |
| lawn | 44.3% | 44.3% | **19.3%** | 19.4% |
| driveway | 0.4% | 0.3% | 1.3% | 1.3% |

Bed on the mulch, lawn on the grass, and all seven plants inside the bed's
own outline — six matched to the model's ellipses, one carried. The first
pass is still placing this yard about 0.2 of the frame too high on every
run; the second pass has corrected it on every run since the merge stopped
refusing the corrections.

**Still open: a region nobody needs.** The driveway comes back as a sliver
at the frame edge — 0.4% of the picture, confidence 0.45, with the model's
own note "only a sliver visible" — and it still gets a name, a colour and a
swatch on the customer's photo. A confidence or minimum-area floor would
drop it. That is a product decision and not a bug, and the threshold is easy
to set wrong: too eager and it hides a narrow bed that is genuinely the job.

### The second pass was right and we were binning it

The obvious response to the section below was to switch the second pass
back on, now that the ground-line bug in it was fixed, and see whether
"correct the outline you can see" fixes a systematic offset. It does.
Completely. On that same brick-house photo the second pass moved the bed
onto the mulch, the lawn onto the grass, the driveway onto the concrete
and all seven plants onto their shrubs.

**The merge kept one correction in three, and none of the plants.**

| region | first pass | second pass | ratio | old verdict |
|---|---|---|---|---|
| mulch bed | 10.9% | 16.8% | 1.55 | accepted |
| lawn | 43.1% | 16.1% | **0.37** | refused |
| driveway | 0.4% | 1.0% | **2.37** | refused |

Both refusals were corrections *away from* a badly wrong answer. The
lawn's 43.1% was inflated because the first pass had it swallowing a slab
of house; shrinking it to 16.1% was the fix. The bounds were 0.5 and 2,
tuned on the assumption that the first pass is roughly right and the second
pass nudges an edge — and when the first pass is wholesale wrong, **every
correction worth having is a large one**. A bound tuned for nudges rejects
exactly the corrections that matter most. They are 0.2 and 5 now: wide
enough for a wholesale relocation, tight enough to refuse a polygon that
has collapsed or swallowed the frame.

The plants failed for a dumber reason. Asked to echo
`front_corner_mulch_bed_plant_1`, the second pass returned `plant_1`, and
all seven corrections died on an exact string comparison. It was reported
as `plants 0/0` — which reads as "nothing was offered" rather than
"nothing matched", so the log hid it too. A model shortening an id it was
told to echo is ordinary behaviour and asking more firmly is not a fix, so
the match now tolerates one id being a tail of the other. Plant ids are
`<regionId>_plant_<n>`, so a tail match still pins the number and the
region is already fixed by the caller.

And the plant *allowance* had the same flaw as the area bounds: a fixed
0.15 of the frame, when a systematic correction moves the bed and
everything standing in it together. A plant may now travel as far as its
own region travelled, plus the original nudge — measured against the shape
actually taken, so a refused polygon buys its plants nothing. A plant flung
across a bed that did not move is still refused, which is what that bound
existed for.

Replayed against the real response: **outlines 3/3, plants 7/7**, every
plant landing on the ground instead of the brickwork. Was 1/3 and 0/0.

**One thing this leaves open.** Partial acceptance means the picture can
mix passes — a bed from the second pass beside a lawn from the first,
which is how they came to overlap in that run's `04-drawn.jpg`. With the
bounds this wide it should be rare, but "rare" is not "impossible", and
regions that overlap are visibly broken. If it shows up again the answer is
probably all-or-nothing: take the whole refinement or none of it.

### What the stage table cannot tell you

A fifth photo — a brick house, a black mulch bed inside a river-rock
cobble border — came through the pipeline perfectly clean. Every stage a
no-op to within 0.1%. And the outlines were **wrong**: the bed's outline
sat on the brick wall, the plant ellipses were on the window shutters, and
the lawn's inner edge ran across the house.

The model put them there. Its own reported ground line was `y 0.305–0.48`
in a photo where the house meets the mulch at about `0.55`, and every
region and every plant is consistent with that — uniformly about 0.2 of
the frame too high. Internally coherent, all of it wrong.

**This is the first stage-1 failure anybody has confirmed**, and it is the
exact failure `groundLine.ts` was built for — a region climbing the wall.
The clamp cannot touch it, because the ground line is wrong in the same
direction and by the same amount, so there is nothing to correct against.

The lesson for reading `npm run segment`: the table says which stage
*changed* the geometry. It cannot say whether stage 1 was right, because a
model that is confidently and consistently wrong produces a table that
looks perfect. **Only the picture answers that.** A clean table plus a bad
`01-model.jpg` is a real result, and it means something different from
everything above this section.

### The same bed, three times

Worth recording next to it, because it bears on how much accuracy is
buyable at all. Across three runs of the identical photo, the identical
prompt and the identical model, that bed came back at **25.5%, 22.3% and
29.8%** of the frame — all three of them plausible-looking outlines.

So run-to-run variance on this task is roughly ±15%, and no amount of
prompt work reduces it to zero, because it is not a wording problem. That
is the strongest argument yet for the position the outline-correction work
already took: make correcting an edge fast and obvious, and stop chasing a
deterministic answer that does not exist.

### And then the first pass's ground line did the same thing

Re-run with the second pass off, the same photo failed a second way — and
this one is worse, because it is not a stray line, it is the concept.

The model returned a 26-vertex bed covering **22.3%** of the frame. Stage 2
returned **0.0%**. The ground line it reported traces the sweep of the wall
cap: `y=0.21` at the left, dropping to `0.98` at mid-frame, back to `0.84`
at the right. The bed spans `y 0.24–0.755`, so it lies *entirely above*
that line, and clamping annihilated it.

That is not a bad line. **A raised bed is above the ground line by
definition** — a bed held up by a retaining wall sits above the point where
that wall meets the ground, in every photograph ever taken of one. No line
can be drawn that makes it otherwise, so no amount of prompt work fixes
this. The model even named the thing it had found: `retaining_wall` at 0.93
confidence, `raised_bed` at 0.88, in the same response whose geometry we
then destroyed.

The guard is now per region and states the module's own principle where it
bites: **a clamp that would leave a region with less than a quarter of its
area does not run for that region.** A bed whose *top* edge strayed onto the
brick — the failure this was built for — has real area below the line, keeps
it, and still comes back corrected; there is a test for exactly that shape
so the guard cannot swallow it. A region with nothing below the line is not
being corrected, it is being deleted.

The cost: a region genuinely drawn up a wall is no longer dropped. That case
is hypothetical. This one has now happened twice on the only two real
photographs anybody has run, and a stray region a customer can see and
ignore beats their bed disappearing. Verified against the actual polygon and
the actual ground line from that run: 22.3% in, 22.3% out.

**Worth saying plainly:** across two real photos the ground clamp has moved
one vertex by 0.004 and destroyed one bed. Its benefit has been observed
once, in an earlier session, against a photo nobody kept. Deleting the
feature outright is a live option and wants one more real photo to decide.

## How the outlines got looked at

*(The diagnosis above came out of the tooling below, which was built before
anyone knew which stage was at fault.)*

Two real photographs came back with outlines that were, in the owner's
words, "not even close" — a raised stone-walled bed whose outline covered
the wall and a fraction of the lava rock, and a curved mulch bed with a
third of its area left out. Outline accuracy is the product: if a
homeowner cannot get their areas recognised, nothing downstream of that
matters.

**The important thing about that report is what it cannot tell us.** What
the customer sees is not the model's output. It is the model's output
after four transformations of ours:

| Stage | What it does | Can move an outline |
|---|---|---|
| 1 — the model | polygons from the photograph | — |
| 2 — the ground line | pulls ground regions off the wall (`lib/vision/groundLine.ts`) | down, or drops the region |
| 3 — the second look | corrects outlines, merge bounds decide how much is kept | anywhere within bounds |
| 4 — drawing | corner-cutting, then the material inset | inward |

Three rounds of prompt work have gone into stage 1, on the assumption that
stage 1 is what is wrong. **That assumption has never been checked**, and
until this session it could not be: `parseSegmentation` applied the ground
clamp *inside the parser*, so the model's own polygons were discarded
before any caller — the design page, a screenshot, a person deciding
whether the prompt needs another round — could see them. Every judgement
ever made about this model's segmentation has been made by looking at
stage 4.

### What was measured

The parse and the clamp are separate now (`parseSegmentationRaw` returns
what was said; `parseSegmentation` is that plus the policy, unchanged), and
two of the four stages can be quantified without a key:

- **Corner cutting costs real area on a coarse polygon.** Measured across
  regular n-gons: 10.8% of area at 5 vertices, 7.8% at 6, 4.6% at 8, 3.0%
  at 10, 0.8% at 20, 0.2% at 40. The smoothing was designed for the 20–40
  vertices the prompt asks for and is close to free there. On the handful
  of vertices the model actually tends to return, it both shrinks the
  region and rounds off corners that were right — which is where the
  blobby look comes from. It is not, on its own, big enough to explain
  "not even close".
- **The material inset is a fixed fraction of the frame, not of the
  region.** `npm run segment` reports it: on the demo overlay it takes up
  to 11% of a small region's area, against a fraction of a percent of a
  large one. A narrow bed loses proportionally far more than a lawn.

The stage that can move an outline *arbitrarily far* is the ground clamp,
and its guard has a hole: the quorum that protects against a badly placed
ground line counts regions **destroyed** — flattened below `1e-6` area. A
line placed too low leaves every region as a thin band near the bottom of
the frame, and a band has area, so the quorum never fires. Verified: three
regions against a ground line at 0.9 when the ground starts at 0.55 all
survive as slivers. Its own comment describes exactly that failure as the
thing it prevents. It does not.

Whether that is what happened to these two photographs is **not** known,
and guessing at it is how the last three rounds were spent.

### `npm run segment`

```sh
npm run segment -- --photo ./yard.jpg
```

One photo, the same bytes and the same prompt production uses, and one
image per stage written to `.segment/`: `01-model.jpg`, `02-ground.jpg`,
`03-refined.jpg`, `04-drawn.jpg`, the annotated frame that was sent for the
second look, and `segmentation.json` with the unparsed reply in it. Then a
table of vertices, share of frame and topmost vertex per region per stage.

The question stops being "why is the model bad at this" and becomes "which
picture stops looking like the yard", which is a question a single upload
answers. If `01-model.jpg` is already wrong, the mechanism has to change
and no amount of prompt wording will do it. If it is right and
`02-ground.jpg` is wrong, the bug is ours and it is a day's work.

Without a key it runs the demo overlay through the same stages and says so,
in those words, so the pictures cannot be read as if they meant something.

## Two buttons that did the same thing, and a call nobody had timed

A fresh read of the previous session's work, before any new feature, found
one bug and one absence.

### "Push it out" pushed it in

`insetOutline` began `Math.min(Math.abs(amount), MAX_INSET)`. The material
fill is the caller it was written for and that caller only ever insets, so
throwing the sign away was invisible there. The nudge buttons added later
encoded their direction *as* the sign — `insetOutline(polygon, -NUDGE)` —
and the function ignored it. Both buttons moved the edge inward by exactly
the same amount: on a unit square, area 0.360 → 0.350 either way.

The direction that was unreachable is the one that undoes an
over-correction. Pull the edge in one press too many and the only way back
was "Put back the edge we found", which throws away every correction made
to that region. And because presses compound on the stored polygon, the
`MAX_INSET` cap bounds one press and not twenty.

The offset is signed now, capped the same either way, and the result is
held inside the frame — an outward nudge on a region already touching the
edge of the photo would otherwise produce a vertex outside it, which
`isUsableOutline` refuses, so the PATCH answers 400, and the configurator
ignores anything that is not ok: the customer would press a button and
watch nothing happen at all. The direction is no longer carried by a minus
sign either. `outsetOutline` says which way it goes at the call site,
because that convention lived only in the caller's head once already.

Six tests, and the one that matters asserts the two directions do opposite
things rather than asserting either one's wording.

### The model call has never been a number

The [thirty seconds](#the-thirty-seconds-measured) table measures every
leg of the funnel except the one that dominates it. Three sessions have
written "somebody with a key should put this in the table" and none could,
because none had a key. The same absence sits under the open question of
whether the refinement pass earns the second call it costs.

Neither needs an experiment. They need the application to say what it just
spent, so that the next real photograph through a real key answers both on
its own. Every segmentation now logs exactly one line:

```
[vision] segmentation 8.4s — first pass 5.2s, 4 regions; annotate 0.2s, second look 3.0s, outlines 3/4 kept, plants 6/7 kept
[vision] segmentation 5.2s — first pass 5.2s, 4 regions; second look off (VISION_REFINE=off)
[vision] segmentation 7.0s — first pass 5.2s, 4 regions; second look skipped after 1.8s (529 overloaded_error)
```

The kept counts are the half that elapsed time cannot give you. A second
look that takes three seconds and has most of its corrections refused by
the merge bounds is a merge to loosen; one that takes three seconds and
lands all of them is a call to make faster. Those want opposite fixes and
the clock cannot tell them apart. They are counted from
`polygonCorrectionAccepted` and `plantCorrectionAccepted` — the same
predicates the merge itself decides with, split out of it for exactly this
reason, so the line and the regions cannot come to disagree about what was
kept.

One line per segmentation, warned rather than informed when the second
look failed, so a run is always one row of data. The formatting is pure
and lives in `lib/vision/timing.ts` so a suite with no key and no network
can assert it — the same split, and the same reason, as `authConfig()`.

## Letting the customer fix the edge

Three rounds of prompt work got the outlines from "a few straight chords
across a curve" to "follows the curve, still sits on the stone border."
That is roughly where placing polygon vertices from a photograph lands, and
a fourth round of wording was not going to close it. The person holding the
phone is standing in the yard and can see exactly where the mulch stops, so
now they get to say.

### Two ways to say it, and the second is not the lesser one

**Drag the edge.** With a region open, "Adjust the edge" puts a handle on
every vertex and a fat invisible stroke along the line: grab anywhere on
the outline, not just on a handle, because on a phone the handles of a
forty-point outline are smaller than a fingertip and closer together than
one. The edge follows the finger at frame rate and the server hears about
it once, on release.

**Nudge the whole edge in or out.** One press, no aiming. This is the
keyboard and screen-reader path — which is why it is a pair of real buttons
rather than a slider — and it also happens to fix the failure that actually
gets reported: an outline sitting a little outside the bed's border all the
way round. It reuses the same inward offset the material fill uses.

Either way, "Put back the edge we found" restores the segmented outline.

### The model's polygon is kept

A correction is stored beside the segmentation's polygon, never over it
(migration 0007). What the model said and what the customer said are
different facts, and only one of them can be improved by a better prompt.
Keeping both is what makes "put it back" possible, and it is what would let
a later session ask how far off the model usually is — the same reason the
deltas table keeps the estimate a rep replaced. Re-segmenting replaces the
region row and takes the correction with it, which is right: it was a
correction to *those* outlines.

One function resolves which outline to draw, because five places draw a
region — the customer's canvas, its material mask, its hit target, the
rep's canvas, and the marker placement — and a correction that reached four
of them would be worse than one that reached none. The rep's lead view says
when a customer corrected an outline, because that is signal: it says both
that the segmentation was off there and that the customer cared enough to
fix it.

The browser is not trusted with the geometry. An outline reaches a rep's
screen and a frozen snapshot, so a correction has to be 3–400 points, all
inside the picture, enclosing an actual area — checked at the route, with
the refusals tested.

### And the fill sits inside the line

Independently of any of that: a swapped material is now painted a fraction
of a percent *inside* the region's outline rather than right up to it. A
bed is edged with cobbles or steel or brick, the traced boundary lands on
or near that edging, and the two ways to be wrong are not equal — material
stopping a hair short is what a real bed looks like, and material painted
across the customer's own stone border is what they notice immediately. The
outline itself does not move; only the fill.

That inward offset had one bug worth recording, because a test caught it
the moment it was written and a screenshot would not have: image
coordinates put y downward, so the normal that is "left of travel" in maths
is the *outward* one here. With the sign flipped it pushed the fill further
over the border it exists to keep off. The test that catches it insets a
ring wound each way and checks both got smaller.

## The bed edge, and the border around it

Two things about an outline that a third photo made specific: it did not
follow the full curve of the bed, and it ran across the river-rock border
around the bed rather than stopping inside it.

### A polygon is not a curve

The graph stores a region as a list of vertices. That list is the artifact
— every quantity and every downstream reader uses it, untouched. But a
polyline through twenty points is the wrong *view* of a bed edge: a real
bed curves, and a chain of straight chords reads as faceted however many
vertices the model returns. More vertices is a losing race against that.

So the drawn path is smoothed (`lib/design/outline.ts`), and the choice of
scheme is decided by the second complaint rather than by taste:

- **It may never bulge outward.** A spline through the points — Catmull-Rom
  or similar — overshoots on convex turns, which would push the swapped
  material *further* over the bed's stone border. Corner cutting (Chaikin)
  stays strictly inside the polygon it cuts, so smoothing can only ever
  pull the fill off the edging.
- **A real corner stays a corner.** A driveway is a rectangle and a step is
  square. A vertex is only cut where the turn is shallow enough to belong
  to a curve, so a bed that runs into a square porch gets a smooth edge and
  a sharp corner in the same outline.

One path does the tint, the stroke, the selection ring, the material mask
and the hit target, so what the customer sees and what they can tap cannot
drift apart. The rep's canvas draws the same path — they are reviewing the
design the customer was shown.

### The border is not part of the bed

Most beds are edged: river-rock cobbles, steel edging, brick, a paver
course, a concrete curb. **That border is not bed.** The region is what
gets re-surfaced when the homeowner swaps mulch for stone, so an outline
drawn across a cobble border paints gravel over the border they already
have.

Both prompts now say so, and the refinement pass — which can see its own
outline against the photograph — checks it as a named fault: *if the
outline sits on the border or outside it, move it to the inner edge, where
the mulch actually stops*. The first-pass prompt also names the curve
failure directly rather than only asking for vertices: *if any part of your
outline is a straight line where the real edge curves, that part needs more
vertices.*

Smoothing helps here too, in the same direction. Cutting corners inward
means the painted material lands a hair short of the traced line rather
than a hair past it, and short of a stone border is invisible where past it
is not.

**Verified here:** the smoothing properties are unit-tested against the
shapes they exist for — a sampled curve never escapes its source polygon, a
square is returned unchanged, and a shape with both gets both. **Not
verified here:** whether the model now stops inside the edging. That needs
a key and a yard with a border in it.

## "Nothing is lining up"

A third photo came back with outlines that followed the bed edges properly
— the vertex cap was the binding constraint and raising it worked — and a
report that the scale was still wrong and nothing lined up.

Two different things were true, and separating them mattered more than
guessing at either.

### The rendering was exact. It was measured, not argued about

The demo overlay has known coordinates, so where they land can be checked
rather than eyeballed. Every plant rendered at precisely its stored
position — `demo_bed_plant_1` is at (0.11, 0.645) in the data and rendered
at (0.11, 0.645) — and the `<figure>`, the `<img>` and the SVG overlay were
pixel-identical in position and size. Whatever was wrong, the transform
from normalized coordinates to the picture was not it.

### The labels pointed at the wrong plants

The same measurement caught the real bug immediately. The hover label for a
plant at cx **0.11** was rendering at cx **0.0235** — exactly half its own
width to the left.

The cause is a CSS composition rule, not a typo. Tailwind's translate
utilities set the standalone `translate` property, and this element also
carried an inline `transform: translate(-50%, …)`. Those are two different
properties, so they do not override one another — **they add up**. The
label was offset by half its width twice.

On a photograph that is invisible as a bug and obvious as a symptom: the
name of one plant appears over a different plant, and the honest conclusion
from looking at it is "the scale is messed up". Which is what was reported,
and it was a fair reading.

`npm run shots` now measures this rather than hoping: every element drawn
over the photo carries the coordinates it is supposed to be at, and the
audit compares them against where it actually landed, including the hover
label against its own plant. Reintroducing the bug produces
`the label for demo_bed_plant_1 is at x=-0.053 but its plant is at x=0.110`
and a non-zero exit.

### The plants were never given a second look

The rest of the misalignment was real, and it was a gap in the previous
session's work rather than a bug in it. The refinement pass corrected
region polygons and **explicitly preserved the plantings** — so the shapes
that most need correcting were the ones excluded from the correction.

They are in it now. The annotated photo carries a ring for every plant in
its region's colour, so the model can see where each one landed, and the
prompt is blunt about the stakes: a ring a few percent off is the
difference between a plant staying put when the mulch is swapped and gravel
being painted across its leaves.

The merge stays conservative, and the bounds are the interesting part. A
plant may be nudged and resized; it may not be moved more than 15% of the
frame, because that is not a correction but a claim that the first pass
matched ids to the wrong plants — and the pass that found the plants is the
better authority on which is which. Radii may change by between 0.4× and
2.5×, so covering foliage the first attempt clipped is allowed and a
tenfold change is not. A plant cannot be invented or dropped, its id and
label survive, and a region whose polygon correction is refused still keeps
its good plant corrections.

**Verified here:** the rendering measurement above, the label fix, the
bounds, and that the audit rule fails when the bug is put back. **Not
verified here:** whether the second pass actually moves the rings onto the
plants. Still needs a key and a yard.

## The first real yard, through a real key

Everything above this section was found against a stand-in image. Then the
owner put a working `ANTHROPIC_API_KEY` and a photograph of an actual front
yard through the app, and found three things no amount of looking at a
synthesised picture could have shown.

### The console nobody could sign in to

Signing in as a contractor returned a server error page and filled the
terminal with `UntrustedHost: Host must be trusted`.

Auth.js will not build a callback URL from a Host header it does not trust
unless it recognises the hosting platform, and the only platform it
recognises by itself is Vercel. Every way this app ships — the Dockerfile,
`render.yaml`, `fly.toml`, `npm start` on a laptop — is self-hosted. So
`/api/auth/session`, `/api/auth/providers` and `/api/auth/error` all threw,
the login page failed to render, and **the console was unreachable on every
deployment target it has**. `lib/auth/options.ts` now sets `trustHost: true`.

The interesting part is why it survived eleven sessions and a whole
deployment runbook. `AUTH_TRUST_HOST` appeared exactly once in the
repository: on the command line in this README's `npm run shots` snippet.
Not in `.env.example`, not in `render.yaml`, not in the `fly secrets` list,
not in `docs/deploy.md`. The only thing that ever signed in set the variable
that hid the bug, and then swallowed the failure — `waitForURL(/dashboard/)`
was followed by `.catch(() => {})`, so a failed sign-in produced screenshots
of the login page filed under the names `dashboard`, `deltas` and
`pricebook`.

Both halves are closed. The snippet no longer sets the variable, so the
screenshot pass signs in the way a deployment does; a sign-in that does not
reach the dashboard is now a finding that exits non-zero (verified by
running it with a wrong password); and `lib/auth/__tests__/config.test.ts`
asserts the setting, which needed `authConfig()` split out of the module
that calls `NextAuth()` — that call pulls in `next/server` and cannot be
loaded by a browser-free test suite, which is why the one line deciding
whether anybody can log in had never been asserted anywhere.

### Regions that climbed the wall

On the first upload the outlines landed roughly right. On later ones they
drifted upward: a foundation bed whose polygon reached a third of the way up
the brick facade, and a front lawn whose top edge sat on the house above it.

The segmentation prompt has always said "only outline ground-plane landscape
areas — never the house walls, roof, sky". Saying a rule in a prompt is not
enforcing it. Two changes:

- **The prompt anchors the vertical axis before it asks for anything.** It
  now says what y=0 and y=1 are, names the failure mode out loud (ground
  regions placed too high, with a top edge on the wall behind them), and
  asks for the ground line *first* so the model finds where the ground
  starts before it outlines anything standing on it.
- **`lib/vision/groundLine.ts` enforces it.** The model reports where
  vertical surfaces meet the ground, left to right; every region vertex
  above that line is pulled down onto it, and a region drawn entirely above
  it is dropped. Placing a polyline is a far easier task than placing a
  polygon, which is the whole reason for asking separately.

Being wrong about the line is cheap by construction. It only ever moves a
vertex *down*, so a line that is too high changes nothing. A line spanning
less than a third of the width is refused rather than extrapolated sideways.
And the failure that would actually hurt — a line placed too *low*, which
would push every region into a sliver at the bottom of the frame — is caught
by a quorum: if applying the line destroys most of what the model found, the
line is likelier to be wrong than all of the regions are, and it is
discarded whole. One region up a wall is an outlier worth correcting; all of
them is a bad ground line.

**This half is not verified.** The clamp is unit-tested against the exact
geometry of the observed failure; whether the model reports a good ground
line, and whether the anchoring paragraph moves the polygons, needs a key
and a yard.

### The outlines, tried again with a real photo

A second real yard showed the ground line was not the whole problem. The
outlines sat in roughly the right place and followed nothing: a curved bed
edge came back as a handful of straight chords, so the same polygon covered
lawn along one side and missed bed along the other — visible the moment the
customer swapped the material and the gravel landed on the grass.

Two of the three fixes are cheap and one is not.

**The prompt was asking for it.** It capped polygons at "4-12 vertices".
That is a fine budget for a driveway and a plain mistake for a bed: a curve
cannot be followed with eight points. It now says to use as many as the
edge needs, that 20-40 along a curved bed edge is normal, to put them where
the edge changes direction, and that regions do not overlap — where a bed
sits inside a lawn, the lawn's outline goes around it.

**The model gets to see its own work.** After the first pass, the outlines
are drawn onto a copy of the photograph — one colour per region, vertices
marked — and sent back with the question "look at where each coloured
outline actually falls, and correct it" (`lib/image/annotate.ts`,
`lib/vision/refine.ts`). Correcting an outline you can see is a much easier
task than producing coordinates blind, and it is the one lever here that
does not depend on a model getting better at a hard thing.

It costs a second vision call, which is real latency against section 2's
thirty seconds and real money per upload. `VISION_REFINE=off` turns it off
without touching code, for measuring one against the other.

**The merge is deliberately timid**, because a second look at a picture
with coloured lines drawn on it is not better placed to judge *what* a
region is than the pass that saw the clean photograph. A refinement may
replace a region's shape and nothing else — not its kind, label, material,
condition, footprint estimate, confidence, or the plants standing in it —
it cannot invent a region or drop one, and a correction that more than
halves or more than doubles a region's area is refused as a disagreement
rather than a tightening. If anything comes back unusable, the first pass
stands. A second look is an improvement, never a requirement, and never a
reason to fail a segmentation that already succeeded.

**Also not verified.** The annotator is unit-tested — the outline lands
where the polygon says, the photo keeps its dimensions, unhandled input
comes back as "no second look" rather than an error — and the merge rules
are tested against the shapes they exist to refuse. Whether the second pass
actually moves the outlines onto the bed edges needs a key and a yard.

### Plants, drawn bigger than reported

The same photo showed granite landing on shrubs the first version had
missed. Two changes: the prompt now asks for **every** visible plant and
says to err large, with one ellipse over a pair of shrubs that grow into
each other rather than two that each miss an edge; and the cut-outs are
drawn 18% larger than reported. The two ways to be wrong here are not
equally bad — too small puts gravel across a shrub's outer leaves, and too
big leaves a ring of bed around a plant, which is what a real bed looks
like. The margin is display-only: the stored ellipse stays exactly what the
model reported, because that is the plant's extent and the per-plant swap
needs the real number, not one padded for masking.

### Gravel over the shrubs

Swapping a bed's surface filled the whole region polygon with the new
material, so choosing river rock turned every shrub standing in the bed grey
along with the mulch. The mulch is what changes.

The fix is not to go hunting for the plants in the picture at render time —
section 1 is explicit that the image is a view and never the artifact. The
plants become objects in the graph. The vision pass now reports the plants
in each region as ellipses (`cx`/`cy`/`rx`/`ry`, four numbers rather than an
outline: a shrub is blobby, and the only thing this has to be good enough
for is not painting gravel over a boxwood), they persist in a `plantings`
column on `regions` (migration 0005), and the swap renders through an SVG
**mask** — the region with the plants punched out of it — instead of a clip
path. Material lands on the ground; the photograph shows through where the
plants are, softened so a crisp oval does not read as a mistake.

It degrades to exactly the old behaviour: the column is nullable and stays
nullable, every region segmented before this has no plantings, and a swap
over an empty list covers the whole region the way it always did. The demo
overlay carries plantings too, so the no-key path exercises the same code —
without that, "swap mulch for stone" looks correct in development and paints
over every shrub in production.

### Product gap — swapping the plants themselves — **built**

This section used to say the swap was blocked on plant SKU metadata and
per-SKU imagery that the repository did not have. **The first half was
wrong** — the metadata has been in `seed/pricebook.seed.ts` since Phase
3.5, along with an install assembly per plant — and the second half was the
wrong requirement, because section 1 wants a shape generated from the graph
rather than a photograph pasted onto the yard. See
[plug-and-play plants](#plug-and-play-plants) for what shipped.

## What a photograph showed

The design system was built against a 48×64 test fixture of four coloured
squares. This session put a photograph behind it — a full-frame image with
sky, a light facade, dark mulch and mid-green lawn — and looked at every
customer surface again. Five things were wrong, and none of them were
visible before there was a picture.

**What this session could not see, and what that leaves open.** It had no
`ANTHROPIC_API_KEY` either, and no network to fetch a photograph with, so
the picture behind these surfaces was synthesised rather than shot: a
12-megapixel frame with a real tonal range and a real aspect ratio, which
is what the layout, the contrast and the overlay geometry needed, and which
is nothing like a photograph where segmentation is concerned. Every finding
below is about how a surface behaves with a picture on it, and every one of
them was reproduced at 390×844 and 1440×900. **The three questions in
[what you are actually testing](#what-you-are-actually-testing) are still
open** — whether segmentation finds the right things, how long the model
call takes, and whether a swapped material convinces over a real
photograph. Those need a key and a camera, and no session has had both.

**A homeowner was being told to set an environment variable.** The demo
overlay's label read "Set `ANTHROPIC_API_KEY` to analyse the real thing" —
developer copy, on a customer's screen, in the largest block above the fold.
On a 390px phone it pushed the customer's own photo down past 300px: the
first thing they saw was an amber warning about a missing credential. §1
says the demo overlay may never ship unlabelled, and it still does not: it
is labelled *twice*, by an "Example areas" pill pinned to the picture
itself and by a line under it that says what is example and what is real
("Everything else here is real: pick a material, watch the range move, send
it to the contractor"). Neither mentions a key. The person who can set one
is reading the terminal, which already says so — and in development the
name appears on the page too, because then they are the same person.

**Two region names were drawn on top of each other.** Markers sat at each
polygon's centroid, clamped off the frame edge, which is fine when the
regions are quadrants of a test fixture and a third of the picture apart.
On a real yard the lawn wraps the walk, both centroids land within a couple
of percent of the same point, and one label covered the other completely:
one region silently unnamed, and a stack that reads as a rendering fault.
Placement is now `lib/design/markers.ts` — clamp, then push apart, with two
rules that are stated in `__tests__/markers.test.ts` rather than looked for
in a screenshot:

- **A name stays inside the region it names.** Nudging blindly moved
  "Front lawn" onto the house, which trades one wrong picture for another.
  Each marker's ladder of candidate positions is clamped to its own
  polygon's vertical extent.
- **Legible beats well-placed.** Where a region is too small to hold two
  names apart, the second one leaves it rather than stack: a name a little
  off its shape costs a glance, two names on top of each other cost a whole
  region.

The contractor's read-only canvas draws from the same function, and it
needed it more — its labels carry the material as well as the name, so they
run longer and collide sooner, and they had no frame clamp at all.

**The swap was hidden under the label naming it.** Selecting a bed filled
its polygon with a river-rock texture and then drew a white pill across the
middle of it — on a phone the pill is wider than the bed. A region that has
been swapped now shows its material and drops its marker. Nothing is lost:
the strip below carries both the name and the material with room for them,
the picker is titled with it, and the polygon is still a click target.

**The region strip read as a list bolted underneath a picture**, which is
what the strip's own design note had worried about. Two things fixed it
without restructuring anything: its heading was `sr-only`, so a row of white
pills floated on the page ground with nothing saying what they were — it is
visible now, directly under the photo — and the sideways scroller ends in an
alpha ramp, so a half-visible pill reads as "there is more" rather than as
something clipped by a bug.

**`/start` offered three upload buttons on a laptop.** `buttonClass` starts
with `inline-flex`, Tailwind emits its display utilities in a fixed order
that puts `inline-flex` after `hidden`, and so a button carrying both was
visible whatever the class attribute said. The `coarse:hidden` on the other
button worked, because a media query is emitted later — which is why the
phone was right and the desktop was not, and why nobody caught it in review:
the markup reads correctly. The switch now lives on wrapper `<div>`s, which
have no competing display utility, and the rule is stated where it can
actually be evaluated: `npm run shots` asserts in the browser that nothing
the markup calls `hidden` is visible, unless a variant that is matching
right now re-shows it. Reintroducing the bug makes the audit fail on
`1440x900` and pass on `390x844`, which is exactly right.

### A promise the product could not keep

The failed-segmentation message ended "or carry on and send it anyway, and a
rep will take a look." That was not true. A failed segmentation has no
regions, so there is nothing to tap, nothing to swap, no band, and
`POST /api/projects/[id]/submit` answers 409 for a design with no
selections — the send form is not even rendered. A customer who took that
sentence at its word would have gone looking for a button that does not
exist.

Making it true means letting a photo be sent with no design attached, and
that is a change to what an EstimateSnapshot is — a feature, not a design
fix, and out of scope for a session that adds none. So the copy now says
what is actually available, and the gap is written down instead:

**Product gap — a lead with no design.** When segmentation fails the
customer is a dead end, and they are exactly the customer worth having: they
photographed their yard. The photo is stored and the project exists; only
the submit path refuses. Whoever picks this up decides what a snapshot with
no line items means before writing any UI for it.

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
to `.shots/` and audits five rules that are easy to state and easy to break:
no horizontal scroll at 390px, no interactive element under 44 CSS px,
nothing visible that the markup says is hidden, a sign-in that reaches the
dashboard, and **anything drawn over the photo landing where its
coordinates say**. It exits non-zero on a finding.

It drives the plant swap as well as the surface swap, because the per-plant
path has its own picker, its own persistence and its own line items and a
surface swap exercises none of them. That is how the `<fieldset>` that
pushed a 390px page 121px sideways was found.

**The phone viewport was not a phone until the twelfth session.** Playwright's
`isMobile` + `hasTouch` report `pointer: coarse` for the first page load and
lose it on the next navigation; emulating the media feature over CDP survives
navigation but is killed for good by the first full-page screenshot, which
overrides the device metrics to capture and cannot be re-established
afterwards on any session. So every "390×844" PNG this script had ever
written was the *fine-pointer* branch at phone width — including the `/start`
shots meant to show the camera button. The pointer type is now forced at the
engine with a `--blink-settings` flag, which nothing later resets, and one
browser is launched per viewport to carry it; the audit re-checks
`(pointer: coarse)` on every surface, because that is a browser flag and
browser flags get renamed.

It is **not** part of `npm test`, which stays browser-free. Run it against a
server you have already started:

```sh
npm run build
AUTH_SECRET=$(openssl rand -base64 32) \
  CONTRACTOR_EMAIL=you@example.com CONTRACTOR_PASSWORD=… npm start &
npm run shots -- --photo ./some-photo.heic
```

This command used to begin `AUTH_TRUST_HOST=1`, and that one variable was
hiding a login nobody could use — see
[the console nobody could sign in to](#the-console-nobody-could-sign-in-to).
It is deliberately not here any more: the screenshot pass signs in the way
a deployment does, and reports a finding if it does not reach the
dashboard.

Three real bugs came straight out of pointing it at a phone viewport: a grid
child with `min-width: auto` stretching the whole page sideways, region
markers stealing each other's taps, and a signed-in rep's lead photo coming
back 401 (see [contractor auth](#contractor-auth)). A fourth came out of
fixing the emulation, and the new audit rule is written for it — see
[what a photograph showed](#what-a-photograph-showed).

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

**It is still not measured.** The deployment session had no
`ANTHROPIC_API_KEY` either, and no deployed instance to point at, so the
table above is unchanged and still excludes the model call. What that
session *could* confirm is that nothing it changed moved the rest of the
number: `npm run shots` against the production standalone build is clean —
no horizontal scroll, no tap target under 44px, no page errors — and the
funnel still runs end to end with rate limiting armed and the aerial leg
gated off. The command to close the gap, against the deployment and then
from a real phone on cellular, is in `docs/deploy.md` §9.

**The application measures it now, even though this session still could
not.** Rather than wait for a session that has both a key and a camera —
there has not been one yet — every segmentation logs what it spent, so the
row above fills itself in from the first real upload. See
[the model call has never been a number](#the-model-call-has-never-been-a-number).

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
  the same as the imagery decision. The deployment session inspected what is
  actually in the wasm and what the licence attaches to; the findings are in
  [three decisions that gate the launch](#three-decisions-that-gate-the-launch),
  and they are findings, not the decision.
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

**Gated off until the imagery and geocoder licences are declared** — see
[the aerial leg is licensed, not built](#the-aerial-leg-is-licensed-not-built).
Everything below is built and tested; it is simply not served yet.

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

**Raised again before launch, and affirmed.** That reasoning was written
when the only photos in existence were generated test fixtures, and the next
photo through this path is of somebody's actual house. The deployment session
put the assumption back in front of the owner rather than quietly
re-affirming it or quietly changing it — neither read moved while the
deployment was wired up — and the answer was to keep it open on the UUID.
It is now a decision somebody made with real photos in view, not an
inherited default. If it is ever overruled, the change is still the
per-project token described above, applied to every customer-facing project
route.

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

`lib/locate/gate.ts` is what now *acts* on that field, together with the
geocoder's own declaration: with either undeclared, the whole aerial leg is
off — the page redirects, the routes 404, the button is absent. The seam
held the shape of the decision; the gate holds the deployment to it.

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
- With `DATABASE_URL` set, the entire suite runs against that server, and
  **each test file gets its own disposable schema** — migrated and seeded
  exactly as `npm run db:setup` would, dropped when the file finishes
  (`vitest.setup.ts`), with `vitest.globalSetup.ts` naming the run and
  sweeping up after a worker that died before its own cleanup ran. A run
  never touches your data.

  It was one schema for the whole run until the deployment session, and
  that was scheduling luck: `lib/pricebook/__tests__/api.test.ts` publishes
  a new price book revision — that is the feature — and
  `lib/db/__tests__/store.test.ts` asserts the org resolves to the seeded
  book. Whether they collided depended on which worker ran them and when,
  and adding unrelated test files to the run was enough to lose the coin
  toss. A suite whose result depends on scheduling is not a suite, and the
  alternative fix — weakening the assertion until the two files stop
  disagreeing — would have deleted the thing being asserted.

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
