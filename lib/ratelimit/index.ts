/**
 * The limiter, composed: a request in, a decision out.
 *
 * This is the whole of the rate limiting story, and it lives at the edge of
 * the app (`middleware.ts`) rather than inside the handlers. That placement
 * is the point: a request refused here never buffers a 25 MB body, never
 * reaches the HEIC decoder, and never spends an Anthropic call — a limit
 * checked inside the handler would have paid most of the bill before it
 * said no.
 *
 * State is per instance and in memory. See `bucket.ts` for why that is the
 * right size of solution here, and docs/deploy.md for what changes if this
 * ever runs on more than a couple of machines.
 */
import { TokenBuckets, type Decision } from "./bucket";
import { clientKey, type HeaderSource } from "./client";
import { policyFor } from "./policy";

export { TokenBuckets } from "./bucket";
export { clientKey } from "./client";
export { policyFor } from "./policy";
export type { Budget, Decision } from "./bucket";
export type { Policy } from "./policy";

export type LimitVerdict = Decision & { policy: string };

export type RateLimitRequest = {
  method: string;
  url: string;
  headers: HeaderSource;
};

export type LimiterEnv = {
  /** "off" disables the limiter — for local development and `npm run shots`. */
  RATE_LIMIT?: string;
  /** The one header this platform writes the client address into. */
  RATE_LIMIT_CLIENT_IP_HEADER?: string;
};

export function limiterEnabled(env: LimiterEnv): boolean {
  return env.RATE_LIMIT?.trim().toLowerCase() !== "off";
}

/**
 * A limiter with its own buckets. One is created per process below; tests
 * make their own so they never share state with each other.
 */
export function createLimiter(options: { now?: () => number; maxKeys?: number } = {}) {
  const buckets = new TokenBuckets(options);

  return {
    buckets,
    /**
     * Null means "not metered" — an unmetered route, or the limiter turned
     * off. A verdict means it was metered, and `allowed` says what to do.
     */
    check(request: RateLimitRequest, env: LimiterEnv = {}): LimitVerdict | null {
      if (!limiterEnabled(env)) return null;

      const pathname = pathnameOf(request.url);
      const policy = policyFor(request.method, pathname);
      if (!policy) return null;

      const key = clientKey(request.headers, env.RATE_LIMIT_CLIENT_IP_HEADER);
      const decision = buckets.take(`${policy.name}:${key}`, policy.budget);
      return { ...decision, policy: policy.name };
    },
  };
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split("?")[0] ?? "/";
  }
}

/** The process-wide limiter the middleware uses. */
export const limiter = createLimiter();
