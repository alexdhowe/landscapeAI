import { NextResponse } from "next/server";

import { bandForSelections } from "@/lib/design/band";
import { ProjectNotFoundError, getProject } from "@/lib/store/projects";
import { wiTypologyConfig } from "@/seed/pricebook.seed";

/**
 * POST { projectId } → the typology band the current design implies, or
 * { band: null } when nothing is selected yet.
 *
 * The pricing engine runs only here, server-side. The response is the
 * customer-facing projection: band endpoints and scope labels — never
 * line items, unit rates, costs, or margin.
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
    const result = bandForSelections(
      project.selections,
      project.marketContext,
      wiTypologyConfig,
    );
    if (!result) {
      return NextResponse.json({ band: null });
    }
    return NextResponse.json({
      band: {
        low: result.band.low,
        high: result.band.high,
        typical: result.band.typical,
        currency: result.band.currency,
        basis: result.band.basis,
      },
      jobType: result.jobType,
      context: project.marketContext,
      scope: result.scope,
    });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    throw error;
  }
}
