import { NextResponse } from "next/server";

/**
 * Liveness, for the platform's health check.
 *
 * Deliberately shallow: it answers "is this process serving requests?" and
 * nothing else. A health check that also pinged Postgres and the object
 * store would turn a thirty-second blip in either into a restart loop of a
 * process that was fine, and would hand an anonymous caller a map of which
 * dependencies are up. Both of those are worse than the thing it would
 * catch — the app already fails loudly and specifically when storage is
 * half-configured (503, with the reason in the log) or the database is
 * unreachable.
 *
 * `lib/ratelimit/policy.ts` leaves this route unmetered on purpose: a
 * flood arriving through one proxy address must not make the deployment
 * look unhealthy and get itself restarted.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
