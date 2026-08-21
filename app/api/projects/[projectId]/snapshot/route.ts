import { NextResponse } from "next/server";

import { submittedSnapshot } from "@/lib/lead/snapshot";
import { ProjectNotFoundError, getProject } from "@/lib/store/projects";

type Params = { params: Promise<{ projectId: string }> };

/**
 * GET → the customer's submitted estimate, served as the frozen snapshot's
 * exact stored bytes. This is a CUSTOMER surface: it returns only
 * customerFacingPayload, never the snapshot's internal fields, and it
 * never re-serializes — byte-identity with what was shown at submit time
 * is the whole point.
 *
 * Specifically the SUBMITTED snapshot, not the latest one: a Phase 6 final
 * quote appends a newer record, and this endpoint's bytes must not change
 * because a rep visited the site. The final quote has its own endpoint
 * (../quote).
 */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  try {
    const project = await getProject(projectId);
    const snapshot = submittedSnapshot(project);
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
