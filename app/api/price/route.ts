import { NextResponse } from "next/server";

import { quoteProject } from "@/lib/design/quote";
import { ProjectNotFoundError, getProject } from "@/lib/store/projects";
import { wiBandPolicy, wiTypologyConfig } from "@/seed/pricebook.seed";

/**
 * POST { projectId } → the customer-facing band for the current design.
 *
 * Basis "typology" until at least one selected region has been measured on
 * the aerial; then basis "measured", with the typology band riding along so
 * the UI can show the range visibly narrowing. Phase 4 reconciliation
 * tightens or widens the band once both sensors have reported.
 *
 * The whole computation lives in lib/design/quote.ts — the same quote the
 * Phase 5 submit freezes — and this route serves ONLY its customerPayload
 * projection: never line items, unit rates, costs, or margin.
 */
export async function POST(request: Request) {
  let body: { projectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.projectId !== "string") {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  try {
    const project = await getProject(body.projectId);
    const quote = quoteProject(project, wiTypologyConfig, wiBandPolicy);
    if (!quote) {
      return NextResponse.json({ band: null });
    }
    return NextResponse.json(quote.customerPayload);
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    throw error;
  }
}
