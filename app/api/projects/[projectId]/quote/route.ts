import { NextResponse } from "next/server";

import {
  NoQuoteableDesignError,
  NotConfirmedError,
  confirmedQuote,
} from "@/lib/confirm/quote";
import { customerBand } from "@/lib/design/quote";
import {
  finalQuoteSnapshot,
  freezeSnapshot,
  submittedSnapshot,
  type SnapshotCustomerView,
} from "@/lib/lead/snapshot";
import { resolveOrg } from "@/lib/org/resolve";
import {
  ProjectNotFoundError,
  ProjectStageError,
  getProject,
  issueFinalQuote,
} from "@/lib/store/projects";

type Params = { params: Promise<{ projectId: string }> };

/** The band the customer was given at submit, for the quote to supersede. */
function submittedBand(project: Awaited<ReturnType<typeof getProject>>) {
  const submitted = submittedSnapshot(project);
  if (!submitted) return null;
  const view = JSON.parse(submitted.customerFacingPayload) as SnapshotCustomerView;
  return customerBand(view.estimate);
}

/**
 * POST → issue the final quote from rep-confirmed quantities.
 *
 * Freezes a SECOND snapshot beside the customer's original. The original
 * is never read for anything but the band this one supersedes, never
 * rewritten, and still serves its own bytes at ../snapshot — that
 * separation is the confirmation gate.
 */
export async function POST(_request: Request, { params }: Params) {
  const { projectId } = await params;
  try {
    const [project, org] = await Promise.all([getProject(projectId), resolveOrg()]);
    const quote = confirmedQuote(project, org.typology, org.finalQuotePolicy, {
      supersededBand: submittedBand(project),
    });
    const snapshot = freezeSnapshot(project, quote);
    await issueFinalQuote(projectId, snapshot);

    return new NextResponse(snapshot.customerFacingPayload, {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (error instanceof ProjectStageError || error instanceof NotConfirmedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof NoQuoteableDesignError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

/**
 * GET → the issued final quote, served as its exact stored bytes.
 *
 * A CUSTOMER surface, like ../snapshot: only the frozen customer payload,
 * never the internal side, and never re-serialized.
 */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  try {
    const project = await getProject(projectId);
    const snapshot = finalQuoteSnapshot(project);
    if (!snapshot) {
      return NextResponse.json(
        { error: "No final quote has been issued for this project" },
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
