import { NextResponse } from "next/server";

import { resolveOrg } from "@/lib/org/resolve";

/**
 * GET → the plants this contractor can install.
 *
 * Served rather than bundled because the price book is editable and
 * revisioned: what is offerable is whatever the org's current published
 * revision can price, and a list compiled into the browser bundle would go
 * stale the moment somebody publishes.
 *
 * Nothing here is internal. The catalog carries names, sizes and habit —
 * what a homeowner needs to choose between two shrubs — and no cost, rate
 * or margin (map section 1). `lib/catalog/plants.ts` is where that is
 * enforced, and a test asserts it.
 */
export async function GET() {
  const org = await resolveOrg();
  return NextResponse.json(
    { plants: org.plantCatalog },
    {
      // One list per revision, and revisions are immutable — but the
      // *current* revision changes when somebody publishes, so this is a
      // short cache rather than a long one.
      headers: { "Cache-Control": "private, max-age=30" },
    },
  );
}
