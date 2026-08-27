# Deploying this thing

Everything an operator needs to put MyScape in front of real people,
and the reasoning behind the choices so they can be overruled rather than
guessed at again.

**Nothing has been deployed yet.** The session that wrote this file had no
cloud account, no domain, no payment method and no Anthropic key, so what
it could do was write the configuration, close the one code gap that made
deploying irresponsible (rate limiting), verify the production artifact end
to end locally, and hand over a runbook. The steps below have not been run
against a real host. Where a step could be checked locally it was, and it
says so.

A later session went through §2 against a real Postgres and an Anthropic
key. What it found is in §2.1, and one item there stops a first deploy
from shipping the product you think it is.

---

## 1. Two paths, and which one you are on

**Path A — free, and nothing runs on your machine.** Render's free instance
(no card), Neon's free Postgres (no card), photos kept in Postgres rather
than a bucket, your own Anthropic key, and a GitHub Action for the database
work. Everything below happens in browser tabs. This is the path the repo
is set up for; `render.yaml` is its whole configuration.

**Path B — about $10–15/month, and it is a real deployment.** Fly.io, a
paid Postgres with point-in-time recovery, photos in Cloudflare R2.
`fly.toml` is its configuration and §11 is the migration path. Take it when
the MVP has earned it.

Four constraints from `lib/` decide both, and only one is about preference.

**The request body must exceed 25 MB.** `MAX_UPLOAD_BYTES` in
`lib/image/limits.ts` is 25 MB because a 48-megapixel iPhone photo does not
fit in less, and the customer most likely to be standing in their yard with
a phone was the one most likely to be rejected. **This rules out Vercel**,
whose serverless functions cap a request body at 4.5 MB — the iPhone upload
path, which is the entry point to the whole funnel, would fail outright.
That is worth stating plainly because Vercel is otherwise the default
answer for a Next.js app, and the number is easy to discover after
committing to a platform rather than before.

**A Node runtime, not edge.** `lib/storage/s3.ts` signs requests with
`node:crypto`, `lib/auth/password.ts` is scrypt from the same module, and
`lib/image/normalize.ts` lazily loads a wasm HEIC decoder. None of that
runs on an edge runtime, which rules out the Workers-shaped free tiers.

**CPU and memory for the decode.** Normalising a 12 MP HEIC is about 1.5 s
of CPU-bound, pure-JavaScript work that blocks the event loop.

**One long-lived process** is what §2's thirty seconds wants. A
scale-to-zero platform spends part of that budget waking up.

### What the free path actually costs you

Both of the last two constraints are the ones Path A bends, and it is
better to know which:

| | Free (Render) | Paid (Fly) |
|---|---|---|
| CPU | **0.1 CPU.** A decode that wants ~1.5 s of a whole core takes many times that. Expect an upload to sit for **10–20 s** rather than 1.5. | 1–2 shared cores; ~1.5 s |
| Cold start | **Spins down after 15 minutes idle**; the next visitor waits ~1 minute for a loading page | Always on |
| RAM | 512 MB. Fine for the 12 MP photos iPhones shoot by default; a 48 MP "HEIF Max" capture may exhaust it | 2 GB |
| Photos | In Postgres, inside Neon's 0.5 GB — roughly 4,000 photos at ~120 KB each | R2, effectively unlimited |
| Postgres | Neon free: 0.5 GB, 100 compute-hours/month, sleeps after 5 min idle | Paid tier with PITR |

**So do not measure the thirty seconds on the free tier.** It is a place to
put the product in front of ten people and collect leads, not a place to
learn what the funnel costs in latency. §9 says the same thing where the
measurement is described.

The honest summary: Path A is a demo that real customers can use. Path B is
the product. The artifact is the same `Dockerfile` either way, so moving is
a redeploy, not a rewrite.

## 2. What has to exist before the first deploy

| Variable | Free path | Why it is not optional |
|---|---|---|
| `AUTH_SECRET` | **Render generates it** (`render.yaml`) | A predictable secret means anyone can mint a contractor session, and the console shows cost, margin and every lead's contact details. Without it the process still starts and the *customer* funnel serves normally — it is the console that dies: `/login` renders, signing in answers 500, and the log says `AUTH_SECRET is not set`. Verified against the standalone build. So the failure to watch for is a site that looks fine with a login that does not work, not a site that will not boot. |
| `DATABASE_URL` | Neon, free | Without it the app runs on the local file store — which in a container means writing to a filesystem that disappears on the next deploy. |
| `ANTHROPIC_API_KEY` | your own key | Without it segmentation falls back to a demo overlay that the UI labels as such. Shipping the demo overlay to a customer is not an option; shipping it *labelled* is the difference between a demo and a lie, and it must stay labelled. |
| `SITE_URL` | set after the first deploy | The absolute base for Open Graph and icon URLs. **Build-time** — see below. |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | **skip all four** | Only for Path B. All four or none: half-configured is a deliberate fatal error, never a quiet fall back to keeping photos in this deployment. With none set and a database configured, photo bytes live in `photo_objects` rows, which is exactly what the free path wants. |

### 2.1 What the pre-flight actually found

Checked against a real Postgres 16 and a real Anthropic key, in the
session before the first deploy.

**The default branch is not the branch you want deployed.** Render's
Blueprint deploys the repository's **default branch**, and GitHub's
default here is `claude/read-begin-execution-imfwzz`, which is **eight
commits behind `main`** — and those eight commits are the whole of the
material rendering, the clone-stamp fill, dragging a plant, the
perspective fit and the plant palette. A Blueprint deploy today ships a
build with none of them, and nothing about the deploy would look wrong.
Fix it *before* step 4, either way round:

- GitHub → Settings → General → Default branch → switch to `main`; or
- after Render creates the service, Settings → Build & Deploy → Branch →
  `main`, then Manual Deploy.

The first is better: it is one setting rather than one per service, and
the branch a repository points at is the one a reader assumes is live.

**The connection string Neon gives you does not work, and the way it
fails is the "drizzle-kit hang".** This is the single most useful thing on
this page. Neon's console hands out

    postgresql://…/neondb?sslmode=require&channel_binding=require

and `channel_binding` is a **libpq client-side parameter, not a Postgres
server setting**. postgres.js copies every query parameter it does not
recognise as one of its own options straight into the connection's startup
packet (see `parseOptions` in the driver — `sslmode` is special-cased and
nothing else is), so the server answers:

    unrecognized configuration parameter "channel_binding"

The app and `npm run db:seed` report that error and stop. **`drizzle-kit
migrate` does not.** It prints `applying migrations...` and spins there
indefinitely with no error, no timeout and no exit — which is exactly the
symptom the eleventh session recorded as a drizzle-kit hang and worked
around by piping the .sql files through psql. It was never a drizzle-kit
bug; it was a connection failure that drizzle-kit swallows.

Reproduced deliberately against Postgres 16 with that parameter in the URL,
and confirmed as the cause: with it, an indefinite spinner; without it,
twelve migrations in about two seconds.

**It is handled in the repo now**, so the paste works as pasted.
`normalizeConnectionUrl` in `lib/db/client.ts` strips libpq's client-side
parameters before the driver sees them, and all three entry points go
through it — the app, `drizzle.config.ts` (so `npm run db:migrate` and the
GitHub Action in step 3), and `npm run db:migrate:direct`. Verified after
the fix by running all three against a URL carrying
`sslmode=require&channel_binding=require`: migrations applied, seed
succeeded, app connected.

You can still strip it yourself, and on any platform whose driver you do
not control you should. Anything not on libpq's client-side list is left
alone, because it might be a real server setting somebody meant.

**Otherwise `npm run db:migrate` works.** Against Postgres 16 over TCP,
all twelve migrations applied in about two seconds and the process exited
on its own; a second run was a one-second no-op; the same held with
`?sslmode=require` alone.

**There is a fallback**, and the hang above is precisely what it is for —
a spinner with no message is a bad thing to meet for the first time during
a deploy. Handed the same broken URL, it says
`Migration failed: unrecognized configuration parameter "channel_binding"`
in about a second:

```sh
npm run db:migrate          # drizzle-kit — the normal path
npm run db:migrate:direct   # scripts/db-migrate.ts — when that one will not finish
```

The fallback runs drizzle-orm's own migrator rather than a
reimplementation of it, so the journal rows it writes are the rows
drizzle-kit would have written: either command can follow the other and
picks up where it left off (verified in both directions). What it adds is
a connection timeout with a message naming the likely causes, a count of
what was already applied and what it did, and a process that closes the
connection and exits. `DB_CONNECT_TIMEOUT` sets the timeout; the default
is 30 seconds, which is generous for Neon's free tier waking from its
five-minute idle suspend.

**Migration 0011 is in `drizzle/meta/_journal.json`** and applies cleanly
to an empty database — twelve entries, `0000_init` through
`0011_plants_added`, and `added_plants` and `plant_positions` are among
the 21 tables afterwards.

**`npm run db:seed` and `npm run db:user` both work against a real
server**, which the GitHub Action in step 3 depends on and which had only
ever been run against PGlite.

**The HEIC decoder survives the standalone build.** §8's last step warns
that the wasm is the one thing a bundler can get wrong quietly, and that
the failure is an iPhone upload which works locally and 500s in
production. Run against `.next/standalone/server.js` — the exact artifact
the container starts, not `next start` — a HEIC fixture posted to
`/api/projects` returned 201 and `GET /api/projects/[id]/photo` came back
`image/jpeg`, a real baseline JPEG. libheif's wasm is inlined into the
traced server chunk rather than left as a file to copy, which is why it
works and why nothing in the Dockerfile has to name it. This does not
replace the smoke test against a real container on a real host; it removes
the bundler from the list of suspects.

**`/robots.txt` is right**, checked on the same build: `Allow: /`, then
`/start`, `/design/`, `/api/` and every console path disallowed; `/`
carries `index, follow` and `/start` carries `noindex, nofollow`.

**The image itself has not been built.** There is no Docker daemon in the
session that wrote this, so the first Render build is the first time the
`Dockerfile` runs. Everything it does *after* `npm run build` is checked
above against that same output; what is unverified is the image build.

**`RATE_LIMIT_CLIENT_IP_HEADER` cannot be settled from here.** It is a
security decision (§10) and the answer is a fact about Render's proxy, so
§8 step 8 below is an experiment against the live deployment rather than a
guess written down now.

**Two of these are build-time values, not runtime ones**, and getting that
wrong is silent rather than loud:

- `SITE_URL` — the root layout's metadata and `/robots.txt` are prerendered
  during the build, so a value set afterwards is ignored and every OG image
  URL you publish says `http://localhost:3000`. Verified both ways against
  a production build.
- `NEXT_PUBLIC_SATELLITE_LICENCE` and `NEXT_PUBLIC_GEOCODER_LICENCE` — the
  aerial leg's gate, inlined into the client bundle.

Render turns a service's environment variables into Docker build arguments
automatically and the `Dockerfile` declares them, so on Render these are
just dashboard entries followed by a redeploy. Elsewhere they are
`--build-arg`.

Nothing secret belongs in `render.yaml`, `fly.toml`, a build argument, or
this repository. Secrets go in the platform's own secret store, typed into
its dashboard.

## 3. The free deploy, in order, from a browser

Nothing here runs on your machine. Roughly 30 minutes, most of it signup
forms.

**1. Postgres — [neon.com](https://neon.com), no card.** Create a project
and copy the connection string. Neon appends `&channel_binding=require` to
it; the repo strips that for you now (§2.1), and removing it yourself does
no harm. **Take the direct one, not the pooled one**
— the pooled host has `-pooler` in it, and this app opens at most five
connections from one small instance, so there is nothing to pool. (Paste
the pooled one anyway and it still works: `lib/db/client.ts` recognises a
pooler and turns off named prepared statements, which is the failure that
would otherwise look like a database fault. The direct endpoint is simply
one less thing between you and Postgres.) Keep the tab open.

**2. GitHub secrets.** In this repository → Settings → Secrets and
variables → Actions → New repository secret:

- `DATABASE_URL` — the string from step 1.
- `CONTRACTOR_ADMIN_PASSWORD` — a long password you choose for your own
  console login. **Delete this secret once step 3 has run.**

**3. Create the schema and your login.** Actions → **Database setup** → Run
workflow. Tick "Also create/update a contractor admin login", fill in your
email and name, run it. It applies the migrations, seeds the price book as
revision 1, and creates your admin account. It is safe to re-run: the seed
refuses to overwrite an org that already exists.

Then delete the `CONTRACTOR_ADMIN_PASSWORD` secret. The password is now a
scrypt hash in your database and the secret has no further use.

**4. Deploy — [render.com](https://render.com), no card.** New → Blueprint →
connect this repository. Render deploys the repo's **default branch** —
see §2.1, which is currently eight commits behind `main`; settle that
first or the deploy is of the wrong code. It reads `render.yaml` and asks
for:

- `DATABASE_URL` — the same string.
- `ANTHROPIC_API_KEY` — your key. Type it into Render's field; it does not
  belong in this repository, in a chat message, or in a commit.
- `SITE_URL` — you do not know it yet. Put anything valid, or leave it and
  fix it in step 5.

Apply, and watch the first build. It builds the Dockerfile, which takes a
few minutes.

**5. Tell it its own address.** Render names the service something like
`https://landscapeai.onrender.com`. Put that in the service's `SITE_URL`
environment variable and redeploy (Manual Deploy → Deploy latest commit).
It is a build-time value, so the redeploy is the point.

**6. Check it.** §8 is the list. Start with `/api/health`, then do the whole
funnel from your phone.

A custom domain is free on Render (Settings → Custom Domains) if you have
one; set `SITE_URL` to it and redeploy.

### If you would rather do it on Fly (Path B)

Same repository, `fly.toml` instead of `render.yaml`, and it needs a card:

```sh
fly launch --no-deploy          # decline its offer to write its own Dockerfile/fly.toml
fly secrets set AUTH_SECRET="$(openssl rand -base64 32)"
fly secrets set DATABASE_URL='<connection string>' ANTHROPIC_API_KEY='<key>'
fly secrets set S3_BUCKET='<bucket>' S3_ENDPOINT='<endpoint>' \
                S3_ACCESS_KEY_ID='<key id>' S3_SECRET_ACCESS_KEY='<secret>'
fly deploy --build-arg SITE_URL=https://<your hostname>
fly certs add <your hostname>
```

The database work is still the GitHub Action — that part does not change,
and it is still the only way to run migrations without a checkout.

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

**On the free path you do not have this**, and pretending otherwise is
worse than knowing it. Neon's free plan gives a short restore window and no
long retention, and the free path also keeps every customer photo in that
same 0.5 GB. So while you are free:

- Treat the corpus as **at risk**. It is a demo with real people in it.
- Take a manual export before anything you would not want to redo — from
  Neon's console, or by running the "Database setup" Action pattern with a
  `pg_dump` step you add for the purpose.
- **The first $19/month this product earns should buy database retention**,
  ahead of a bigger web instance. A slow deployment annoys people; a lost
  `measurement_deltas` table is the one loss the product cannot absorb.

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

- **Logs go to stdout and stderr**, which the host collects — Render shows
  them in the service's Logs tab, Fly in `fly logs` — and keeps for a short
  window. Route handler exceptions are logged by Next
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

0. On the free tier, wake it first: open the URL and wait out the ~1 minute
   cold start. Everything below assumes a warm instance, and the first
   request after 15 idle minutes is not a fair test of anything.
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
7. **Which header carries the caller's address — an experiment, not a
   guess.** `RATE_LIMIT_CLIENT_IP_HEADER` decides what the rate limiter
   buckets on, so a header the *client* can set is a budget the client can
   reset by changing it (§10). The limiter's default order tries
   `fly-client-ip`, `cf-connecting-ip`, `true-client-ip`, `x-real-ip` and
   then `x-forwarded-for`, and the first four are only safe if Render's
   proxy overwrites them. Render fronts services with Cloudflare, which
   writes and overwrites `cf-connecting-ip`, so that is the expected
   answer — but "expected" is not "measured", and this is two minutes:

   ```sh
   # 1. Spend the upload budget from one address.
   for i in $(seq 1 12); do
     curl -s -o /dev/null -w '%{http_code} ' -X POST https://<host>/api/projects -F photo=@some.jpg
   done; echo          # → 201s, then 429s

   # 2. While still refused, try again claiming to be somebody else.
   for h in x-real-ip true-client-ip cf-connecting-ip; do
     printf '%s -> ' "$h"
     curl -s -o /dev/null -w '%{http_code}\n' -H "$h: 203.0.113.7" \
       -X POST https://<host>/api/projects -F photo=@some.jpg
   done
   ```

   Any header that turns the 429 back into a 201 is one the client
   controls end to end, and the limiter must not trust it. Set
   `RATE_LIMIT_CLIENT_IP_HEADER` in the Render dashboard to a header that
   *stayed* 429 — `cf-connecting-ip` if it did — and redeploy. If every
   one of them resets the budget, set it to `x-forwarded-for`: it is a
   list a client can prepend to, but Render documents the leftmost entry
   as the real caller, and the limiter reads the leftmost.

   Naming one header explicitly is worth doing even when the default order
   happens to be right, because the default is a guess that re-runs on
   every request and this is a fact you have now measured.

8. **The HEIC path specifically.** The wasm decoder is the one thing a
   bundler can get wrong quietly, and the failure mode is an upload that
   works locally and 500s in production. Upload an actual iPhone HEIC and
   confirm what comes back from `GET /api/projects/[id]/photo` is a JPEG,
   upright, with no EXIF. *Checked locally against the production
   standalone build during this session — a HEIC fixture went in, a
   portrait JPEG came out — but not yet against a container on a host.*

---

## 9. Measuring the thirty seconds

**Not on the free tier.** A 0.1-CPU instance turns a 1.5 s decode into
10–20 s and a cold start adds a minute; measuring there tells you about
Render's free plan, not about this product. Measure on Path B, or on a
warm paid instance, and treat any free-tier number as an upper bound with
no diagnostic value.

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
   On Render this is not a thing to reason about from documentation —
   **§8 step 7 is the experiment that settles it**, and it takes two
   minutes against the live deployment. Until it has been run, the default
   order is a guess that re-runs on every request. On the free tier the budgets
   matter less as a defence against a determined attacker than as a
   guarantee that one script cannot spend your whole Anthropic balance
   while you sleep, and they do that either way.
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
- **Migrations run from a GitHub Action**, not from a release command,
  because `drizzle-kit` and `tsx` are devDependencies and the runtime image
  deliberately has neither. The Action is also what makes a laptop
  unnecessary. It is a manual trigger on purpose: a migration that runs
  itself on every deploy is a migration that can take the site down without
  anyone deciding to.
- **No CI on push.** Nothing runs `npm test` when you commit; a broken
  build is discovered by Render failing to deploy, which costs build
  minutes and time. A CI workflow is a small addition when you want it.
- **The free tier's numbers are in §1** and are not defects to be fixed
  here: 0.1 CPU, a cold start, 512 MB, and a database with no real backup
  retention. They are what free costs.
- **This repository is public.** Nothing secret is in it and nothing here
  changes because of that — but `seed/pricebook.seed.ts` becomes your real
  burden, overhead and margin figures the moment real bids replace the
  Wisconsin placeholders, and those are the numbers project-map §1 says
  never to show a customer. Make the repository private before that swap,
  or keep the real book only in the database and edit it at `/pricebook`.
