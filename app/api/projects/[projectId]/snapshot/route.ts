import { NextResponse } from "next/server";

import { latestSnapshot } from "@/lib/lead/snapshot";
import { ProjectNotFoundError, getProject } from "@/lib/store/projects";

type Params = { params: Promise<{ projectId: string }> };

/**
 * GET → the customer's submitted estimate, served as the frozen snapshot's
 * exact stored bytes. This is a CUSTOMER surface: it returns only
 * customerFacingPayload, never the snapshot's internal fields, and it
 * never re-serializes — byte-identity with what was shown at submit time
 * is the whole point.
 */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  try {
    const project = await getProject(projectId);
    const snapshot = latestSnapshot(project);
    if (!snapshot) {
      return NextResponse.json(
        { error: "This design has not been submitted" },
        { status: 404 },
      );
    }
    return new NextResponse(snapshot.customerFacingPayload, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    throw error;
  }
}
