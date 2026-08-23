/**
 * The bucket itself: burst, refill, isolation, and a bound on memory.
 *
 * The clock is injected, so this is arithmetic rather than a test that
 * sleeps — `npm test` stays fast and stays free of timing flake.
 */
import { describe, expect, it } from "vitest";

import { TokenBuckets, type Budget } from "../bucket";

/** Small numbers so a test can say exactly what it expects. */
const BUDGET: Budget = { capacity: 3, refillPerMinute: 6 }; // one token every 10s

function clock(start = 0) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("token buckets", () => {
  it("allows a burst up to capacity, then refuses", () => {
    const buckets = new TokenBuckets({ now: clock().now });

    expect(buckets.take("a", BUDGET).allowed).toBe(true);
    expect(buckets.take("a", BUDGET).allowed).toBe(true);
    const last = buckets.take("a", BUDGET);
    expect(last.allowed).toBe(true);
    expect(last.remaining).toBe(0);

    expect(buckets.take("a", BUDGET).allowed).toBe(false);
  });

  it("refuses without spending a token, so a retry loop cannot push its own recovery away", () => {
    const time = clock();
    const buckets = new TokenBuckets({ now: time.now });
    for (let i = 0; i < 3; i++) buckets.take("a", BUDGET);

    // Hammer it while refused.
    for (let i = 0; i < 50; i++) expect(buckets.take("a", BUDGET).allowed).toBe(false);

    // One refill interval later, exactly one request gets through.
    time.advance(10_000);
    expect(buckets.take("a", BUDGET).allowed).toBe(true);
    expect(buckets.take("a", BUDGET).allowed).toBe(false);
  });

  it("says how long to wait, and the wait is honest", () => {
    const time = clock();
    const buckets = new TokenBuckets({ now: time.now });
    for (let i = 0; i < 3; i++) buckets.take("a", BUDGET);

    const refused = buckets.take("a", BUDGET);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(10);

    time.advance(refused.retryAfterSeconds * 1000);
    expect(buckets.take("a", BUDGET).allowed).toBe(true);
  });

  it("refills over time and never past capacity", () => {
    const time = clock();
    const buckets = new TokenBuckets({ now: time.now });
    for (let i = 0; i < 3; i++) buckets.take("a", BUDGET);

    time.advance(60 * 60 * 1000); // an hour of doing nothing
    for (let i = 0; i < 3; i++) expect(buckets.take("a", BUDGET).allowed).toBe(true);
    expect(buckets.take("a", BUDGET).allowed).toBe(false);
  });

  it("keeps one caller's budget away from another's", () => {
    const buckets = new TokenBuckets({ now: clock().now });
    for (let i = 0; i < 3; i++) buckets.take("noisy", BUDGET);
    expect(buckets.take("noisy", BUDGET).allowed).toBe(false);

    // The customer who happened to arrive during someone else's flood.
    expect(buckets.take("quiet", BUDGET).allowed).toBe(true);
  });

  it("bounds its own memory, evicting the least recently seen first", () => {
    const buckets = new TokenBuckets({ now: clock().now, maxKeys: 10 });

    for (let i = 0; i < 100; i++) buckets.take(`flood-${i}`, BUDGET);
    expect(buckets.size).toBeLessThanOrEqual(10);

    // Eviction is a fresh budget, not a permanent ban: the evicted caller
    // is the one who stopped calling.
    expect(buckets.take("flood-0", BUDGET).allowed).toBe(true);
  });

  it("keeps a busy key while evicting idle ones", () => {
    const buckets = new TokenBuckets({ now: clock().now, maxKeys: 5 });

    buckets.take("busy", BUDGET);
    for (let i = 0; i < 20; i++) {
      buckets.take(`other-${i}`, BUDGET);
      buckets.take("busy", BUDGET); // touched constantly
    }

    // "busy" spent its three tokens and is still being tracked.
    expect(buckets.take("busy", BUDGET).allowed).toBe(false);
  });
});
