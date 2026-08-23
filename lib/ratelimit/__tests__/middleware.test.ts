/**
 * The acceptance path for rate limiting, driven through the real
 * `middleware.ts` — in process, no server, no network, the way the rest of
 * this suite tests things.
 *
 * What it has to show is the sentence the deployment note makes: hammer the
 * upload and the vision routes past the limit from one address and they
 * shed load rather than falling over, while a normal customer in another
 * session is unaffected.
 */
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { config, isConsole, middleware } from "../../../middleware";

const ORIGIN = "https://landscape.example.com";

function request(method: string, path: string, ip: string, extra: Record<string, string> = {}) {
  return new NextRequest(new URL(path, ORIGIN), {
    method,
    headers: { "fly-client-ip": ip, ...extra },
  });
}

/** Fire `n` requests and report what came back. */
function hammer(n: number, method: string, path: string, ip: string) {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) statuses.push(middleware(request(method, path, ip)).status);
  return statuses;
}

const allowed = (statuses: number[]) => statuses.filter((s) => s !== 429).length;

afterEach(() => {
  delete process.env.RATE_LIMIT;
});

describe("the app's edge", () => {
  it("sheds an upload flood from one address, and keeps serving everyone else", () => {
    const statuses = hammer(200, "POST", "/api/projects", "203.0.113.10");

    // It answered every one of them — shedding, not falling over.
    expect(statuses).toHaveLength(200);
    // And most of them cost nothing: no body buffered, no decoder woken.
    expect(allowed(statuses)).toBeLessThan(15);
    expect(statuses.at(-1)).toBe(429);

    // The customer who arrived in the middle of that flood.
    const customer = middleware(request("POST", "/api/projects", "203.0.113.11"));
    expect(customer.status).not.toBe(429);
  });

  it("sheds a vision flood the same way, on its own budget", () => {
    const ip = "203.0.113.20";
    const statuses = hammer(100, "POST", "/api/vision", ip);
    expect(allowed(statuses)).toBeLessThan(15);

    // Same address, different route: the buckets do not pool, so spending
    // the vision budget has not spent the upload budget.
    expect(middleware(request("POST", "/api/projects", ip)).status).not.toBe(429);
    // Nor the customer's ability to read their own project back.
    expect(middleware(request("GET", `/api/projects/2f1c`, ip)).status).not.toBe(429);
  });

  it("tells a refused caller when to come back, and not who else is spending", async () => {
    const ip = "203.0.113.30";
    hammer(50, "POST", "/api/projects", ip);
    const refused = middleware(request("POST", "/api/projects", ip));

    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(refused.headers.get("Cache-Control")).toBe("no-store");

    const body = await refused.json();
    expect(body.error).toMatch(/too many requests/i);
    expect(JSON.stringify(body)).not.toMatch(/bucket|budget|capacity|token|ip|203\.0\.113/i);
  });

  it("lets one customer's whole session through untouched", () => {
    // Upload a photo, segment it, price a few swaps, look at the pictures,
    // then send it — the funnel §2 describes, from one address.
    const ip = "203.0.113.40";
    const session = [
      ["POST", "/api/projects"],
      ["POST", "/api/vision"],
      ["GET", "/api/projects/2f1c"],
      ["GET", "/api/projects/2f1c/photo"],
      ...Array.from({ length: 12 }, () => ["POST", "/api/price"] as const),
      ["POST", "/api/geocode"],
      ["POST", "/api/projects/2f1c/aerial"],
      ["POST", "/api/projects/2f1c/aerial"],
      ["POST", "/api/projects/2f1c/submit"],
      ["GET", "/api/projects/2f1c/snapshot"],
    ] as const;

    for (const [method, path] of session) {
      expect(middleware(request(method, path, ip)).status, `${method} ${path}`).not.toBe(429);
    }
  });

  it("never meters the health check", () => {
    const statuses = hammer(300, "GET", "/api/health", "203.0.113.50");
    expect(statuses.every((s) => s !== 429)).toBe(true);
  });

  it("meters sign-in attempts", () => {
    const statuses = hammer(60, "POST", "/api/auth/callback/credentials", "203.0.113.60");
    expect(allowed(statuses)).toBeLessThan(15);
  });

  it("still sends a signed-out person to the login page", () => {
    // The console gate this middleware started life as, unchanged.
    const response = middleware(request("GET", "/dashboard", "203.0.113.70"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/login?next=%2Fdashboard`);
  });

  it("lets every customer surface through untouched", () => {
    // The regression that cost a browser pass to find: one matcher entry
    // with a named parameter made Next hand every path in the app to this
    // function, and everything it did not recognise fell through to the
    // console's login redirect — including the landing page.
    for (const path of ["/", "/start", "/login", "/design/2f1c", "/design/demo", "/deltas-of-something"]) {
      const response = middleware(request("GET", path, "203.0.113.130"));
      expect(response.status, path).toBe(200);
      expect(response.headers.get("location"), path).toBeNull();
    }
  });

  it("knows which paths are the console and which only look like one", () => {
    expect(isConsole("/dashboard")).toBe(true);
    expect(isConsole("/leads/2f1c")).toBe(true);
    expect(isConsole("/pricebook")).toBe(true);
    expect(isConsole("/deltas")).toBe(true);

    expect(isConsole("/")).toBe(false);
    expect(isConsole("/design/2f1c")).toBe(false);
    expect(isConsole("/deltas-report")).toBe(false);
    expect(isConsole("/dashboardish")).toBe(false);
  });

  it("keeps the matcher to subtrees, which is the shape Next matches correctly", () => {
    // `/design/:projectId/locate` — a named parameter in the middle of an
    // entry — matched everything. Entries name a subtree; the function
    // decides what happens inside it.
    for (const entry of config.matcher) {
      expect(entry, entry).toMatch(/^\/[a-z-]+(\/:path\*)?$/);
    }
  });

  it("does not rate limit the console pages", () => {
    const signedIn = { cookie: "authjs.session-token=whatever" };
    for (let i = 0; i < 300; i++) {
      const response = middleware(request("GET", "/dashboard", "203.0.113.80", signedIn));
      expect(response.status).not.toBe(429);
    }
  });

  it("can be turned off for local work", () => {
    process.env.RATE_LIMIT = "off";
    const statuses = hammer(200, "POST", "/api/projects", "203.0.113.90");
    expect(statuses.every((s) => s !== 429)).toBe(true);
  });

  it("sends a bookmarked aerial URL back to the design while the leg is unlicensed", () => {
    // The page checks this too, but it sits behind a loading.tsx Suspense
    // boundary, so its own notFound() resolves after a 200 has been
    // streamed. A gate that answers "200 OK" is not a gate.
    const response = middleware(request("GET", "/design/2f1c/locate", "203.0.113.110"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/design/2f1c`);
  });

  it("redirects to the host the customer asked for, not the one the process runs on", () => {
    // In a self-hosted Next server the URL middleware sees is built from
    // the process's own hostname and port, so the documented
    // `new URL(path, request.url)` sends a production customer to
    // localhost. Both redirects reconstruct the host from the request.
    const proxied = {
      host: "landscape.example.com",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "landscape.example.com",
    };

    expect(
      middleware(request("GET", "/dashboard", "203.0.113.120", proxied)).headers.get("location"),
    ).toBe("https://landscape.example.com/login?next=%2Fdashboard");

    expect(
      middleware(request("GET", "/design/2f1c/locate", "203.0.113.121", proxied)).headers.get(
        "location",
      ),
    ).toBe("https://landscape.example.com/design/2f1c");
  });

  it("cannot be reset by a client that sets its own forwarded-for header", () => {
    const ip = "203.0.113.100";
    for (let i = 0; i < 50; i++) {
      middleware(request("POST", "/api/projects", ip, { "x-forwarded-for": `198.51.100.${i}` }));
    }
    const refused = middleware(
      request("POST", "/api/projects", ip, { "x-forwarded-for": "198.51.100.254" }),
    );
    expect(refused.status).toBe(429);
  });
});
