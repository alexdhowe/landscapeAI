/**
 * §8 of docs/deploy.md, executable.
 *
 *   npm run smoke -- --base https://your-host
 *
 * A runbook nobody runs is a runbook that is wrong, and the checks that
 * matter here are the ones easiest to skip because they are tedious: a
 * burst of twenty uploads to see the limiter engage, the same snapshot
 * fetched twice and compared byte for byte, a HEIC pushed through the
 * wasm decoder that only production loads differently.
 *
 * This is deliberately browser-free — plain fetch, so it runs anywhere
 * and finishes in under a minute. It does NOT replace `npm run shots
 * --base <url>`, which drives the funnel in a real browser; the two
 * cover different halves of §8 and the output says which half is missing.
 *
 * Nothing here needs a credential except the two console checks, which
 * read CONTRACTOR_EMAIL and CONTRACTOR_PASSWORD and skip themselves
 * loudly when those are unset.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1] ?? "");
}
const BASE = (args.get("base") ?? process.env.SMOKE_BASE_URL ?? "").replace(/\/$/, "");
const PHOTO = args.get("photo") ?? "lib/image/__tests__/fixtures/portrait-iphone.heic";

if (!BASE) {
  console.error("usage: npm run smoke -- --base https://your-host [--photo ./some.heic]");
  process.exit(2);
}

type Result = "pass" | "fail" | "skip";
const results: { name: string; result: Result; detail: string }[] = [];
const record = (name: string, result: Result, detail = "") => {
  results.push({ name, result, detail });
  const mark = result === "pass" ? "  ok  " : result === "fail" ? " FAIL " : " skip ";
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
};

const ms = () => Date.now();

/**
 * The first request after fifteen idle minutes on a free instance waits
 * about a minute for the container to come back. That is not a failure,
 * but everything after it would be measuring the wrong thing — and the
 * *appearance* of that minute is itself worth reporting, because it is
 * what the first person you share the link with will see.
 */
async function wake() {
  const started = ms();
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(180_000) });
    const waited = ms() - started;
    record(
      "cold start",
      res.ok ? "pass" : "fail",
      `${(waited / 1000).toFixed(1)}s to first byte${waited > 10_000 ? " (was asleep — everything below is warm)" : ""}`,
    );
  } catch (error) {
    record("cold start", "fail", String(error));
  }
}

async function health() {
  const res = await fetch(`${BASE}/api/health`);
  const body = await res.text();
  const ok = res.ok && body.includes('"status":"ok"');
  record("GET /api/health", ok ? "pass" : "fail", `${res.status} ${body.slice(0, 60)}`);
}

async function robots() {
  const res = await fetch(`${BASE}/robots.txt`);
  const body = await res.text();
  const allowsRoot = /^Allow: \/$/m.test(body);
  const hidesFunnel = ["/start", "/design/", "/dashboard", "/leads/"].every((p) =>
    body.includes(`Disallow: ${p}`),
  );
  record(
    "robots.txt opens / and closes the rest",
    allowsRoot && hidesFunnel ? "pass" : "fail",
    allowsRoot ? (hidesFunnel ? "" : "a private path is missing") : "/ is not allowed",
  );
}

/**
 * SITE_URL is a BUILD argument. Set it after the fact and nothing
 * complains — the prerendered <head> keeps whatever it was built with,
 * and every link anybody shares previews as localhost. This is the check
 * that catches the redeploy people skip.
 */
async function siteUrl() {
  const html = await (await fetch(`${BASE}/`)).text();
  const og = html.match(/property="og:image"[^>]*content="([^"]+)"/)?.[1]
    ?? html.match(/content="([^"]+)"[^>]*property="og:image"/)?.[1];
  if (!og) return record("SITE_URL baked into the build", "fail", "no og:image on the landing page");
  const host = new URL(BASE).host;
  const right = og.includes(host);
  record(
    "SITE_URL baked into the build",
    right ? "pass" : "fail",
    right ? og : `og:image says ${og} — set SITE_URL and REDEPLOY, it is a build arg`,
  );
}

/** The HEIC leg: the one thing a bundler can get wrong quietly. */
async function heic() {
  let bytes: Buffer;
  try {
    bytes = readFileSync(PHOTO);
  } catch {
    return record("HEIC upload → JPEG back", "skip", `no photo at ${PHOTO}`);
  }
  const form = new FormData();
  form.append("photo", new Blob([new Uint8Array(bytes)], { type: "image/heic" }), "photo.heic");
  const started = ms();
  const res = await fetch(`${BASE}/api/projects`, { method: "POST", body: form });
  if (!res.ok) {
    return record("HEIC upload → JPEG back", "fail", `upload answered ${res.status}`);
  }
  const { projectId } = (await res.json()) as { projectId: string };
  const photo = await fetch(`${BASE}/api/projects/${projectId}/photo`);
  const type = photo.headers.get("content-type") ?? "";
  const out = Buffer.from(await photo.arrayBuffer());
  const isJpeg = out[0] === 0xff && out[1] === 0xd8 && out[2] === 0xff;
  record(
    "HEIC upload → JPEG back",
    type.includes("jpeg") && isJpeg ? "pass" : "fail",
    `${((ms() - started) / 1000).toFixed(1)}s, ${type}, ${out.length} bytes`,
  );
  return projectId;
}

/** An estimate the customer saw is frozen. Fetch it twice and compare. */
async function snapshot(projectId: string | undefined) {
  if (!projectId) return record("snapshot is byte-identical", "skip", "no project to read");
  const url = `${BASE}/api/projects/${projectId}/snapshot`;
  const a = Buffer.from(await (await fetch(url)).arrayBuffer());
  const b = Buffer.from(await (await fetch(url)).arrayBuffer());
  const digest = (x: Buffer) => createHash("sha256").update(x).digest("hex").slice(0, 12);
  record(
    "snapshot is byte-identical across reads",
    a.equals(b) ? "pass" : "fail",
    `${digest(a)} / ${digest(b)}`,
  );
}

/**
 * The limiter, and then the question it depends on.
 *
 * A budget is only a budget if the caller cannot mint a new one. The
 * limiter keys on whichever header it believes carries the caller's
 * address, and the trusted list is only trustworthy where the platform's
 * own proxy overwrites those headers. So: spend the budget, then try
 * again claiming to be someone else. Anything that turns the 429 back
 * into a 201 is a header the client controls, and
 * RATE_LIMIT_CLIENT_IP_HEADER must name one that did not.
 */
async function rateLimit() {
  // A real, valid 1x1 JPEG, encoded here rather than pasted as base64.
  // The pasted one was malformed — the server answered 500 "invalid
  // huffman sequence" twenty times, which still exercised the limiter
  // (it runs in middleware, before any decode, which is the whole point
  // of it) but made every status code below meaningless.
  const { default: jpeg } = await import("jpeg-js");
  const tiny = Buffer.from(
    jpeg.encode({ data: Buffer.from([255, 255, 255, 255]), width: 1, height: 1 }, 80).data,
  );
  const post = async (headers: Record<string, string> = {}) => {
    const form = new FormData();
    form.append("photo", new Blob([new Uint8Array(tiny)], { type: "image/jpeg" }), "t.jpg");
    const res = await fetch(`${BASE}/api/projects`, { method: "POST", body: form, headers });
    return res;
  };

  let refused: Response | null = null;
  for (let i = 0; i < 20; i++) {
    const res = await post();
    if (res.status === 429) {
      refused = res;
      break;
    }
  }
  if (!refused) {
    return record(
      "rate limiter refuses a burst",
      "fail",
      "twenty uploads and never a 429 — the limiter is not engaging",
    );
  }
  record(
    "rate limiter refuses a burst",
    "pass",
    `429 with Retry-After: ${refused.headers.get("retry-after") ?? "(missing!)"}`,
  );

  // Now the forgeable-header question, while still refused.
  //
  // Only a *success* means the budget reset. A 500 or a 415 means the
  // request got past the limiter and then failed for some other reason,
  // which says nothing either way — reporting that as a forged budget is
  // a false alarm, and a false alarm on a security check is worse than
  // no check, because the next one gets ignored.
  // A different address per header, and that is not cosmetic. The limiter
  // buckets on the *value*, so sending 203.0.113.7 four times puts all
  // four probes in one bucket: the first spends from it and the rest read
  // as "did not reset" whether or not the platform overwrote the header.
  // Which is a wrong answer, arrived at confidently, on a security check.
  // Documentation range, one address each.
  const probes: [string, string][] = [
    ["x-real-ip", "203.0.113.11"],
    ["true-client-ip", "203.0.113.12"],
    ["cf-connecting-ip", "203.0.113.13"],
    ["x-forwarded-for", "203.0.113.14"],
  ];
  const forged: string[] = [];
  const unclear: string[] = [];
  for (const [header, address] of probes) {
    const res = await post({ [header]: address });
    if (res.ok) forged.push(header);
    else if (res.status !== 429) unclear.push(`${header} (${res.status})`);
  }
  if (forged.length === probes.length) {
    // All four means nothing is rewriting headers in front of this host —
    // the signature of a bare origin, which is what localhost is and what
    // a deployment must not be. On a platform there is a proxy and it
    // overwrites at least one of these; if it overwrites none, the
    // limiter has nothing trustworthy to key on and the answer is a
    // proxy, not a setting.
    record(
      "the caller cannot mint a fresh budget",
      "fail",
      "all four spoofed headers reset it — nothing is proxying this host. " +
        "Expected on localhost; on a deployment it means the limiter has no " +
        "trustworthy header and RATE_LIMIT_CLIENT_IP_HEADER cannot fix it",
    );
  } else if (forged.length > 0) {
    record(
      "the caller cannot mint a fresh budget",
      "fail",
      `these reset it: ${forged.join(", ")} — the proxy does not overwrite them, so ` +
        "the limiter must not read them. Set RATE_LIMIT_CLIENT_IP_HEADER to one that " +
        "stayed refused",
    );
  } else if (unclear.length > 0) {
    record(
      "the caller cannot mint a fresh budget",
      "skip",
      `inconclusive — ${unclear.join(", ")} got past the limiter but failed for another reason`,
    );
  } else {
    record("the caller cannot mint a fresh budget", "pass", "every spoofed header stayed refused");
  }
}

/** The lead's photo is not public. */
async function photoIsPrivate(projectId: string | undefined) {
  if (!projectId) return record("lead photo is closed when signed out", "skip", "no project");
  const res = await fetch(`${BASE}/api/leads/${projectId}/photo`, { redirect: "manual" });
  const closed = res.status === 401 || res.status === 403;
  record(
    "lead photo is closed when signed out",
    closed ? "pass" : "fail",
    `${res.status}${closed ? "" : " — expected 401"}`,
  );
}

/** The aerial leg ships dark on purpose. A 200 here is a licence problem. */
async function aerialStaysOff() {
  const res = await fetch(`${BASE}/api/geocode`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "1 Main St" }),
  });
  record(
    "the aerial leg is still gated off",
    res.status === 404 ? "pass" : "fail",
    `POST /api/geocode → ${res.status}${res.status === 404 ? "" : " — expected 404 (lib/locate/gate.ts)"}`,
  );
}

console.log(`\nSmoke tests against ${BASE}\n`);
await wake();
await health();
await robots();
await siteUrl();
await aerialStaysOff();
const projectId = await heic();
await snapshot(projectId);
await photoIsPrivate(projectId);
await rateLimit();

const failed = results.filter((r) => r.result === "fail");
const skipped = results.filter((r) => r.result === "skip");
console.log(
  `\n${results.length - failed.length - skipped.length} passed` +
    `${failed.length ? `, ${failed.length} FAILED` : ""}` +
    `${skipped.length ? `, ${skipped.length} skipped` : ""}`,
);
console.log(
  "\nStill only doable by hand: the camera leg from a real iPhone on cellular,\n" +
    "and the console's confirm → quote → /deltas path. `npm run shots -- --base\n" +
    `${BASE}` +
    "` drives the funnel in a browser; §8 step 3 needs a phone.",
);
process.exit(failed.length === 0 ? 0 : 1);
