# Deploying this thing

Everything an operator needs to put LandscapeAI in front of real people,
and the reasoning behind the choices so they can be overruled rather than
guessed at again.

**Nothing has been deployed yet.** The session that wrote this file had no
cloud account, no domain, no payment method and no Anthropic key, so what
it could do was write the configuration, close the one code gap that made
deploying irresponsible (rate limiting), verify the production artifact end
to end locally, and hand over a runbook. The steps below have not been run
against a real host. Where a step could be checked locally it was, and it
says so.

---

## 1. The host: Fly.io

Four constraints from `lib/` decide this, and only one of them is about
preference.

**The request body must exceed 25 MB.** `MAX_UPLOAD_BYTES` in
`lib/image/limits.ts` is 25 MB because a 48-megapixel iPhone photo does not
fit in less, and the customer most likely to be standing in their yard with
a phone was the one most likely to be rejected. **This rules out Vercel**,
whose serverless functions cap a request body at 4.5 MB — the iPhone upload
path, which is the entry point to the whole funnel, would fail outright.
That is worth stating plainly because Vercel is otherwise the default answer
for a Next.js app, and the number is easy to discover after committing to
the platform rather than before.

**A Node runtime, not edge.** `lib/storage/s3.ts` signs requests with
`node:crypto`, `lib/auth/password.ts` is scrypt from the same module, and
`lib/image/normalize.ts` lazily loads a wasm HEIC decoder. None of that runs
on an edge runtime.

**CPU and memory for the decode.** Normalising a 12 MP HEIC is about 1.5 s
of CPU-bound, pure-JavaScript work that blocks the event loop, and
`lib/image/limits.ts` admits up to 80 megapixels — an RGB buffer for one of
those is ~240 MB before the JPEG encoder allocates its own. So: a machine
with real memory, a request timeout comfortably above a few seconds, and
honest concurrency limits.

**One long-lived process.** §2's thesis is a customer playing inside thirty
seconds of landing. A scale-to-zero platform spends part of that budget on a
cold start, which is the one budget this product cannot borrow from.

Fly.io meets all four, runs a plain container, bills for one small
always-on machine, and has a region in Chicago (`ord`) — the closest one to
the Wisconsin service area the seed data describes. `fly.toml` is the whole
configuration.

**The choice is cheap to reverse**, which is the other reason it is
defensible: the artifact is a plain `Dockerfile` running `node server.js` on
`$PORT`. Render, Railway, a DigitalOcean droplet or an ECS task all run it
unchanged. If Fly turns out to be wrong, moving costs a `fly.toml`.

Managed services, none of them Fly-specific:

| Need | Suggested | Why |
|---|---|---|
| Postgres | Neon or Supabase | project-map §3 names both; either gives point-in-time recovery, which §5 below makes a hard requirement |
| Object storage | Cloudflare R2 | S3-compatible, no egress fee, and `lib/storage/s3.ts` speaks SigV4 without an SDK |
| Vision | Anthropic API | already the only model dependency |

---

## 2. What has to exist before the first deploy

All of these are currently unset. `.env.example` documents every one and
the optional ones too; this is the subset a production deployment cannot
open without.

| Variable | Why it is not optional |
|---|---|
| `AUTH_SECRET` | The app refuses to serve in production without it, on purpose: a predictable secret means anyone can mint a contractor session, and the console shows cost, margin and every lead's contact details. `openssl rand -base64 32`. |
| `DATABASE_URL` | Without it the app runs on the local file store, which in a container means writing to a filesystem that disappears on the next deploy. |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | All four or none. Half-configured is a deliberate fatal error (503 with the reason in the log), never a quiet fall back to keeping photos in this deployment. |
| `ANTHROPIC_API_KEY` | Without it segmentation falls back to a demo overlay that the UI labels as such. Shipping the demo overlay to a customer is not an option; shipping it *labelled* is the difference between a demo and a lie, and it must stay labelled. |
| `NEXT_PUBLIC_SITE_URL` | The absolute base for OG and icon URLs. Build-time — see the note below. |

**`NEXT_PUBLIC_*` are build-time, not runtime.** Next inlines them into the
client bundle when the image is built, so they are `--build-arg` values (see
`Dockerfile` and the `[build.args]` block in `fly.toml`) and changing one
means rebuilding, not restarting. Set them in **both** places: the server
reads the runtime value and the browser reads the baked one, and a
deployment that sets only one shows customers a button that 404s.

Nothing secret belongs in `fly.toml`, in a build arg, or in this
repository. Secrets go in the platform's secret store:

```sh
fly secrets set AUTH_SECRET="$(openssl rand -base64 32)"
fly secrets set DATABASE_URL='<the connection string your Postgres provider gave you>'
fly secrets set S3_BUCKET='<bucket>' S3_ENDPOINT='<endpoint>' \
                S3_ACCESS_KEY_ID='<key id>' S3_SECRET_ACCESS_KEY='<secret>'
fly secrets set ANTHROPIC_API_KEY='<key>'
```

---

## 3. First deploy, in order

```sh
# 0. Prerequisites: a Postgres, a private R2 bucket, an Anthropic key, a
#    hostname. The bucket must be private — nothing hands a browser an
#    object URL, and lib/storage/index.ts explains why every read is
#    streamed by the app.

# 1. Create the app without deploying, then set the secrets above.
fly launch --no-deploy            # edit the app name in fly.toml if you like
fly secrets set …                 # section 2

# 2. Schema and price book, from a checkout on your machine, pointed at the
#    production database. drizzle-kit and tsx are devDependencies and are
#    deliberately not in the runtime image.
export DATABASE_URL='<the same connection string>'
npm ci
npm run db:migrate
npm run db:seed        # writes seed/pricebook.seed.ts as revision 1, published;
                       # refuses to overwrite an existing org

# 3. The first contractor account. Prompts for the password so it stays out
#    of shell history. There is no default password anywhere in this repo
#    and there must not be one.
npm run db:user -- --email <you@yourdomain> --name "<Your Name>" --role admin

# 4. Build and deploy. NEXT_PUBLIC_* are build args.
fly deploy --build-arg NEXT_PUBLIC_SITE_URL=https://<your hostname>

# 5. Point the hostname at it and let Fly issue the certificate.
fly certs add <your hostname>
```

Then run the smoke tests in §8 before telling anyone the address.

---

## 4. What is deliberately switched off

**The aerial leg — `/design/[projectId]/locate`, `POST /api/geocode`, and
the drawing routes — does not go live.** It is gated in `lib/locate/gate.ts`
on two licensing decisions that are not a build session's to make:

- **Imagery.** Some tile licences prohibit deriving and reselling
  measurements, which is exactly what this leg does with them. The Esri
  demo tiles the map draws today are `unreviewed`.
- **Geocoding.** `lib/geo/geocode.ts` is Nominatim, whose usage policy does
  not cover production commercial traffic.

**The owner's standing decision is to hold on both** until there is a
working MVP — neither licence is worth paying for before the funnel has
proved itself. So the aerial leg ships dark on purpose, and the first
release is the photo → design → band → lead path with the band at typology
width. Treat a bug report of "the address step is missing" as this
decision, not a regression.

Until both are declared `permitted`, the gate answers 404 on the routes and
redirects a bookmarked `/locate` URL back to the design; the price rail does
not offer the button. The rest of the funnel is unaffected — the customer
keeps their photo, their design, a typology band and the ability to send it,
which is the same path §3 already specifies for the customer who declines to
give an address. `lib/locate/__tests__/gate.test.ts` drives that path rather
than assuming it.

When licences are signed, the whole change is two declarations at build and
runtime:

```sh
fly deploy \
  --build-arg NEXT_PUBLIC_SATELLITE_TILE_URL='<your tile template>' \
  --build-arg NEXT_PUBLIC_SATELLITE_ATTRIBUTION='<the attribution your licence requires>' \
  --build-arg NEXT_PUBLIC_SATELLITE_LICENCE=permitted \
  --build-arg NEXT_PUBLIC_GEOCODER_LICENCE=permitted
fly secrets set NEXT_PUBLIC_SATELLITE_LICENCE=permitted NEXT_PUBLIC_GEOCODER_LICENCE=permitted
```

Declaring `permitted` is an assertion about a contract somebody signed.
Nothing in this repo will assume one: an unrecognised or missing value is
`unreviewed`, which is off.

---

## 5. Backups, and a restore you have actually done

`measurement_deltas` is the training corpus. project-map §6 calls the query
over it "the whole business", and it is the one loss this product cannot
absorb: every other table can be rebuilt from a seed file or from customers
doing the thing again, and that one cannot.

**The requirement, not a suggestion:** point-in-time recovery on the
Postgres, retention of at least 7 days, and a restore drill run **before**
the first real lead arrives and quarterly after that. Neon and Supabase both
provide PITR on their paid tiers; a `pg_dump` on a cron is an acceptable
second copy but is not a substitute, because it loses everything since the
last run.

The drill, which is the part people skip:

```sh
# 1. Restore the latest snapshot into a NEW database (never over the live one).
# 2. Point a local checkout at the restored copy and count what matters:
DATABASE_URL='<restored copy>' npx tsx -e "
  import { getDb } from './lib/db/client';
  const db = await getDb();
  console.log(await db.execute('select count(*) from measurement_deltas'));
  console.log(await db.execute('select count(*) from estimate_snapshots'));
"
# 3. Compare against the same counts on the live database.
# 4. Write down the wall-clock time the restore took. That number is your
#    real RTO; the provider's marketing number is not.
```

Photos live in the object store, not the database, and R2 needs its own
answer: turn on object versioning, or accept that a deleted photo is gone.
A lost photo is a bad day; a lost delta is the business.

---

## 6. Logs and errors

`console.error` is the whole of the instrumentation today, and this session
did not add a logging framework — a dependency and an account are a
decision with a bill attached, and the deployment does not need one to be
operable.

What that means concretely, and what to do about it:

- **Logs go to stdout and stderr**, which Fly collects (`fly logs`) and
  keeps for a short window. Route handler exceptions are logged by Next
  with a stack; the two deliberate operational logs are the storage
  misconfiguration error in `app/api/projects/route.ts` and the migration
  failures.
- **Set up a log drain before you need one.** `fly logs` is a tail, not an
  archive: the incident you want to read about is the one that happened
  yesterday. Any drain the operator already pays for (Better Stack,
  Datadog, S3 archive) is fine; picking one is an account decision, not a
  code change.
- **Error tracking is the first thing to add after launch.** A hosted
  error tracker with a release marker is worth more than any amount of
  log grepping, and it is what turns "a customer said it broke" into a
  stack trace. It needs an account and a DSN, so it is named here as the
  follow-up rather than half-added.
- **Rate limiting is visible in the HTTP metrics**, not in the logs. The
  limiter does not log refusals — at flood volume that is the log becoming
  the outage — so watch the 429 rate on the platform's per-status metrics.
  A sustained non-zero 429 rate on `/api/projects` or `/api/vision` means
  either an attack or budgets that are too tight; both are worth a look.

---

## 7. Indexing: the marketing page, and nothing else

`app/layout.tsx` sets `robots: { index: false, follow: false }` for the
whole app, and this session decided that stays right for everything except
the front door.

- **`/` is indexable** (`app/page.tsx` overrides the default, and
  `app/robots.ts` says the same at the site level). It is a marketing page:
  it names the product, describes what it does, and holds the button that
  starts the funnel. A product nobody can find is not in front of real
  people.
- **Everything else stays `noindex`.** `/design/<uuid>` renders a
  photograph of a real house next to the contact details attached to it, and
  the UUID is the only thing between a stranger and both — an indexed
  project URL is a privacy incident, not a ranking problem. The console is
  private. `/start` is noindex too: it is a step in a funnel, not a landing
  page, and it has nothing to say to a searcher.

`robots.txt` is the polite half and is not a control. The controls are the
unguessable UUID, the auth guard on the console, and the per-page `noindex`
that is honoured even when a URL is discovered some other way.

---

## 8. Smoke tests, against the real deployment

Run these in order, from a phone on cellular where it says so. Anything
that fails here fails before the address is given to a customer.

1. `GET /api/health` → `{"status":"ok"}`.
2. `GET /` renders, and `/robots.txt` allows `/` and disallows the rest.
3. **From a real iPhone, on cellular**: open `/start`, take a photo of a
   yard with the camera, see labelled regions, swap mulch to stone, get a
   band, send it. This is the acceptance path and the camera leg cannot be
   checked any other way.
4. The photo renders on `/leads/[id]` after signing in on a desktop, and
   `GET /api/leads/[id]/photo` 401s when signed out.
5. Correct a quantity on the lead, see the delta at `/deltas`, and confirm
   `GET /api/projects/[id]/snapshot` returns **byte-identical** bytes before
   and after the correction (`curl … | sha256sum`, twice).
6. Rate limiting: `for i in $(seq 1 20); do curl -s -o /dev/null -w '%{http_code} ' -X POST https://<host>/api/projects -F photo=@some.heic; done`
   → a short run of 201s and then 429s with a `Retry-After`, while a second
   device on a different network is unaffected.
7. **The HEIC path specifically.** The wasm decoder is the one thing a
   bundler can get wrong quietly, and the failure mode is an upload that
   works locally and 500s in production. Upload an actual iPhone HEIC and
   confirm what comes back from `GET /api/projects/[id]/photo` is a JPEG,
   upright, with no EXIF. *Checked locally against the production
   standalone build during this session — a HEIC fixture went in, a
   portrait JPEG came out — but not yet against a container on a host.*

---

## 9. Measuring the thirty seconds

The table in the README was measured on a local production build **without**
an `ANTHROPIC_API_KEY`, so it excludes the vision call — which is the whole
risk. With a key, against the deployment:

```sh
npm run shots -- --base https://<your hostname> --photo ./some.heic
```

and separately from a real phone on a real cellular connection, because a
datacentre-to-datacentre number is not the customer's experience. If the
number is bad, the lever is `lib/vision/classify.ts` — the model and the
size of the JSON the prompt asks for — and trading segmentation quality for
latency is a product decision, not a deployment one.

`npm run shots` sets `RATE_LIMIT` for nothing: run it against a deployment
and it will spend upload and vision budget like a customer would. That is
fine at one run; a loop of them will 429 itself.

---

## 10. Rate limiting, and when it stops being enough

`lib/ratelimit/` is per-IP token buckets, in memory, checked in
`middleware.ts` before a handler sees the request — which is what keeps a
25 MB body unbuffered and the HEIC decoder cold when the answer is no.
Budgets are in `lib/ratelimit/policy.ts`, with the tightest on
`POST /api/projects` and `POST /api/vision`.

It is deliberately not distributed. State is per instance, so running *N*
machines multiplies every budget by *N* — a factor of two on two machines,
which is fine, and a reason to think again at ten. What to reach for, in
order:

1. **Set `RATE_LIMIT_CLIENT_IP_HEADER`** to the one header your platform
   writes (`fly-client-ip`; `cf-connecting-ip` behind Cloudflare). Without
   it the limiter guesses, and the fallback is a header a client can forge.
2. **Put the platform's own limiter in front** if there is one. Cloudflare's
   rate limiting rules run before the request reaches the app at all, which
   is strictly better than anything in-process; the buckets here stay as the
   floor that travels with the app.
3. **Only then** consider a shared counter. It buys exactness at the cost of
   a Redis to provision, a network hop on the hot path, and a new failure
   mode — and at this size the thing being defended is a CPU bill, not a
   ledger.

**Do not weaken the anonymity to get there.** A required login on `/start`
would delete the product: §2's whole thesis is no address and no form.

---

## 11. Known gaps, written down rather than fixed here

- **No Content-Security-Policy.** The app sets `X-Frame-Options`,
  `nosniff`, a referrer policy and HSTS (`next.config.ts`). A real CSP needs
  care with `next/font`, MapLibre and Next's inline bootstrap script, and a
  wrong one breaks the page for everybody — worth a session, not a
  drive-by.
- **No error tracker** (§6).
- **One machine, so a deploy is a brief interruption.** Fine at this size;
  two machines and a rolling deploy is a `fly scale count 2` away, with the
  rate limiter caveat above.
- **Migrations run from an operator's checkout**, not from a release
  command, because `drizzle-kit` and `tsx` are devDependencies and the
  runtime image deliberately has neither. That is the right trade at one
  deployment and the wrong one at ten.
