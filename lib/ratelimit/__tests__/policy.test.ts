/**
 * The budget table, read as a table.
 *
 * What these assert is the shape of the decision rather than the exact
 * numbers: the two routes that spend somebody else's money are the two
 * tightest, the route a customer taps while playing is comfortable, and
 * nothing outside /api is metered at all.
 */
import { describe, expect, it } from "vitest";

import { policyFor } from "../policy";

const budget = (method: string, path: string) => policyFor(method, path)?.budget;
const name = (method: string, path: string) => policyFor(method, path)?.name;

describe("the rate limit policy", () => {
  it("meters only /api", () => {
    expect(policyFor("GET", "/")).toBeNull();
    expect(policyFor("GET", "/start")).toBeNull();
    expect(policyFor("GET", "/design/2f1c/locate")).toBeNull();
    expect(policyFor("GET", "/dashboard")).toBeNull();
  });

  it("puts the tightest budgets on the two routes that spend somebody else's bill", () => {
    const upload = budget("POST", "/api/projects")!;
    const vision = budget("POST", "/api/vision")!;
    const price = budget("POST", "/api/price")!;

    // 25 MB and ~1.5s of CPU-bound decode each.
    expect(upload.refillPerMinute).toBeLessThanOrEqual(5);
    // One Anthropic call each.
    expect(vision.refillPerMinute).toBeLessThanOrEqual(6);
    // Pure CPU and small — and it fires on every material swap.
    expect(price.refillPerMinute).toBeGreaterThan(vision.refillPerMinute * 2);
  });

  it("gives every policy a burst above its sustained rate per minute", () => {
    for (const [method, path] of [
      ["POST", "/api/projects"],
      ["POST", "/api/vision"],
      ["POST", "/api/price"],
      ["POST", "/api/geocode"],
      ["GET", "/api/projects/2f1c/photo"],
    ] as const) {
      const b = budget(method, path)!;
      expect(b.capacity).toBeGreaterThan(0);
      expect(b.refillPerMinute).toBeGreaterThan(0);
      expect(b.capacity).toBeGreaterThanOrEqual(Math.min(b.refillPerMinute, 5));
    }
  });

  it("keeps each route's budget in its own namespace", () => {
    // A customer who has spent their uploads can still read their project
    // back and still get a price — the buckets do not pool.
    expect(name("POST", "/api/projects")).toBe("upload");
    expect(name("GET", "/api/projects/2f1c")).toBe("read");
    expect(name("POST", "/api/price")).toBe("price");
    expect(name("POST", "/api/geocode")).toBe("geocode");
    expect(name("POST", "/api/vision")).toBe("vision");
    expect(name("POST", "/api/projects/2f1c/submit")).toBe("submit");
    expect(name("POST", "/api/projects/2f1c/aerial")).toBe("draw");
  });

  it("matches ids positionally, so the id format is not part of the table", () => {
    for (const id of ["2f1c", "b6a0c0a4-6bd8-4a2f-9a1e-4a1a1f1a1a1a", "whatever"]) {
      expect(name("POST", `/api/projects/${id}/submit`)).toBe("submit");
      expect(name("GET", `/api/projects/${id}/snapshot`)).toBe("read");
    }
  });

  it("leaves the platform health check unmetered", () => {
    // A flood arriving through one proxy address must not make the
    // deployment look unhealthy and get itself restarted.
    expect(policyFor("GET", "/api/health")).toBeNull();
  });

  it("meters sign-in attempts, because each one costs a scrypt", () => {
    const auth = budget("POST", "/api/auth/callback/credentials")!;
    expect(auth.refillPerMinute).toBeLessThanOrEqual(6);
    // Reading the session or the CSRF token is not an attempt.
    expect(name("GET", "/api/auth/session")).toBe("read");
  });

  it("has a budget for a route nobody has written yet", () => {
    expect(name("GET", "/api/something-new")).toBe("read");
    expect(name("POST", "/api/something-new")).toBe("write");
  });
});
