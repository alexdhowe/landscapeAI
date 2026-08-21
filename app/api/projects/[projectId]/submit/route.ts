import { NextResponse } from "next/server";

import { quoteProject } from "@/lib/design/quote";
import { freezeSnapshot } from "@/lib/lead/snapshot";
import type { LeadContact } from "@/lib/lead/types";
import { resolveOrg } from "@/lib/org/resolve";
import {
  ProjectLockedError,
  ProjectNotFoundError,
  getProject,
  submitProject,
} from "@/lib/store/projects";

type Params = { params: Promise<{ projectId: string }> };

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function parseContact(raw: unknown): LeadContact | null {
  if (raw === null || typeof raw !== "object") return null;
  const c = raw as { name?: unknown; email?: unknown; phone?: unknown; notes?: unknown };
  if (typeof c.name !== "string" || c.name.trim().length === 0 || c.name.length > 120) {
    return null;
  }
  if (typeof c.email !== "string" || !EMAIL_RE.test(c.email) || c.email.length > 200) {
    return null;
  }
  if (c.phone !== undefined && (typeof c.phone !== "string" || c.phone.length > 40)) {
    return null;
  }
  if (c.notes !== undefined && (typeof c.notes !== "string" || c.notes.length > 2000)) {
    return null;
  }
  const contact: LeadContact = { name: c.name.trim(), email: c.email.trim() };
  if (typeof c.phone === "string" && c.phone.trim()) contact.phone = c.phone.trim();
  if (typeof c.notes === "string" && c.notes.trim()) contact.notes = c.notes.trim();
  return contact;
}

/**
 * POST { contact: { name, email, phone?, notes? } } → submit the design as
 * a lead.
 *
 * Freezes the current quote into an immutable EstimateSnapshot and locks
 * the project. The response body IS the snapshot's customerFacingPayload,
 * served as the exact stored string — the customer's confirmation and the
 * stored record are the same bytes by construction.
 *
 * Works with or without an address: addressDeclined projects submit on
 * their typology band.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params;
  let body: { contact?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const contact = parseContact(body.contact);
  if (!contact) {
    return NextResponse.json(
      { error: "contact must be { name, email, phone?, notes? } with a valid email" },
      { status: 400 },
    );
  }

  try {
    const project = await getProject(projectId);
    if (project.status !== "playing") {
      return NextResponse.json(
        { error: "This design has already been submitted" },
        { status: 409 },
      );
    }

    const org = await resolveOrg();
    const quote = quoteProject(project, org.typology, org.bandPolicy);
    if (!quote || !quote.estimate) {
      return NextResponse.json(
        { error: "Pick at least one option before sending your design" },
        { status: 409 },
      );
    }

    const snapshot = freezeSnapshot(project, quote, {
      priceBook: { revisionId: org.revisionId, revision: org.revision },
    });
    await submitProject(projectId, contact, snapshot);

    return new NextResponse(snapshot.customerFacingPayload, {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (error instanceof ProjectLockedError) {
      return NextResponse.json(
        { error: "This design has already been submitted" },
        { status: 409 },
      );
    }
    throw error;
  }
}
