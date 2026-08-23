import { NextResponse } from "next/server";

import { geocodeAddress } from "@/lib/geo/geocode";
import { locateEnabled } from "@/lib/locate/gate";

/**
 * POST { query } → { candidates, source }.
 *
 * Candidates carry source "nominatim" or "demo"; the UI labels demo pins
 * explicitly. The address itself is only ever sent to the geocoder — it is
 * not stored until the customer confirms a candidate via project PATCH.
 */
export async function POST(request: Request) {
  // The aerial leg is gated on two licensing decisions, and this route is
  // part of it — hiding the page while leaving the geocoder open would be
  // a gate in name only. See lib/locate/gate.ts.
  if (!locateEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { query?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.query !== "string" || body.query.trim().length < 3) {
    return NextResponse.json({ error: "Enter an address to search for" }, { status: 400 });
  }
  if (body.query.length > 200) {
    return NextResponse.json({ error: "Address is too long" }, { status: 400 });
  }
  return NextResponse.json(await geocodeAddress(body.query.trim()));
}
