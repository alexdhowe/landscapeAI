/**
 * Per-key token buckets, in memory, in process.
 *
 * Deliberately not a distributed rate limiter. At this size the app runs as
 * one or two instances behind one proxy, and a shared counter would mean a
 * Redis to provision, a network hop on the hot path of every request, and a
 * failure mode (Redis down — fail open or fail closed?) that is worse than
 * the thing it fixes. What this buys instead is the property that actually
 * matters: no single caller can spend an unbounded amount of this
 * deployment's CPU or somebody else's metered API. Running two instances
 * doubles every budget below, which is a factor of two, not a factor of
 * infinity.
 *
 * Pure: no imports, no clock of its own unless you leave `now` unset, no
 * Node APIs — it runs in the edge runtime the middleware is bundled into,
 * and it is testable in process without a timer.
 */

/**
 * A budget: `capacity` requests available at once, refilling at
 * `refillPerMinute` a minute. Burst and sustained rate are separate numbers
 * on purpose — a customer taps six things in three seconds and then does
 * nothing for a minute, and a limiter that only models the sustained rate
 * either refuses that customer or lets an attacker run flat out.
 */
export type Budget = {
  capacity: number;
  refillPerMinute: number;
};

export type Decision = {
  allowed: boolean;
  /** Tokens left after this call. Whole tokens — a partial refill is not a request. */
  remaining: number;
  /** Whole seconds until one token is available. 0 when allowed. */
  retryAfterSeconds: number;
};

type Bucket = {
  /** Fractional: a bucket refilling at 3/min gains 0.05 tokens a second. */
  tokens: number;
  updatedAt: number;
};

const MINUTE_MS = 60_000;

/**
 * The key ceiling. Every distinct client IP that touches a metered route
 * costs one small object per policy until it is evicted; a flood from many
 * addresses must not turn the limiter itself into the memory leak. Least
 * recently used goes first, which is exactly the caller who has stopped
 * being a problem.
 */
const DEFAULT_MAX_KEYS = 20_000;

export class TokenBuckets {
  /** Map iteration order is insertion order; re-inserting on touch makes it LRU. */
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(options: { maxKeys?: number; now?: () => number } = {}) {
    this.maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
    this.now = options.now ?? Date.now;
  }

  /** Number of keys currently held. For tests and for a log line. */
  get size(): number {
    return this.buckets.size;
  }

  /**
   * Spend one token against `key`, or refuse.
   *
   * A refusal costs the caller nothing — no token is taken — so a client
   * hammering a limit it has already hit does not push its own recovery
   * further away. That is the difference between shedding load and
   * punishing a retry loop into never recovering.
   */
  take(key: string, budget: Budget): Decision {
    const now = this.now();
    const existing = this.buckets.get(key);
    const bucket = existing ?? { tokens: budget.capacity, updatedAt: now };

    if (existing) {
      const elapsed = Math.max(0, now - existing.updatedAt);
      const refilled = (elapsed / MINUTE_MS) * budget.refillPerMinute;
      bucket.tokens = Math.min(budget.capacity, existing.tokens + refilled);
      bucket.updatedAt = now;
      // Delete before set so the re-insert moves this key to the end.
      this.buckets.delete(key);
    }

    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;

    this.buckets.set(key, bucket);
    this.evictIfFull();

    return {
      allowed,
      remaining: Math.floor(Math.max(0, bucket.tokens)),
      retryAfterSeconds: allowed ? 0 : secondsToNextToken(bucket.tokens, budget),
    };
  }

  /**
   * Drop a bucket that has refilled to capacity — it holds no information
   * a fresh one would not. Called on eviction; exposed for tests.
   */
  forget(key: string): void {
    this.buckets.delete(key);
  }

  private evictIfFull(): void {
    if (this.buckets.size <= this.maxKeys) return;
    const overBy = this.buckets.size - this.maxKeys;
    let dropped = 0;
    for (const key of this.buckets.keys()) {
      this.buckets.delete(key);
      if (++dropped >= overBy) break;
    }
  }
}

function secondsToNextToken(tokens: number, budget: Budget): number {
  if (budget.refillPerMinute <= 0) return 60;
  const needed = 1 - Math.max(0, tokens);
  return Math.max(1, Math.ceil((needed / budget.refillPerMinute) * 60));
}
