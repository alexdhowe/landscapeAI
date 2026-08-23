import { NextResponse } from "next/server";

import { classifyPhoto } from "@/lib/vision/classify";
import { isVisionMediaType } from "@/lib/vision/mediaTypes";
import {
  ProjectLockedError,
  ProjectNotFoundError,
  getProject,
  getProjectPhoto,
  setSegmentation,
} from "@/lib/store/projects";

/**
 * POST { projectId } → run vision segmentation on the project's photo and
 * persist the result. Idempotent: re-running replaces the segmentation.
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
    await getProject(body.projectId);
    const { bytes, mediaType } = await getProjectPhoto(body.projectId);
    // The upload route normalises everything into this list, so a stored
    // photo outside it is a bug here rather than a bad upload.
    if (!isVisionMediaType(mediaType)) {
      return NextResponse.json({ error: "Stored photo has unsupported type" }, { status: 500 });
    }

    try {
      const segmentation = await classifyPhoto(bytes, mediaType);
      const project = await setSegmentation(body.projectId, {
        status: "ready",
        ...segmentation,
      });
      return NextResponse.json(project);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      // The operator gets the real thing, with the fix next to it. This is
      // the only place it appears: a customer whose photo failed cannot act
      // on an upstream status code, and reading one to them is how "the
      // model is misconfigured" becomes "this product is broken".
      console.error(`[vision] segmentation failed: ${detail}`);
      const hint = operatorHint(detail);
      if (hint) console.error(`[vision] ${hint}`);

      const project = await setSegmentation(body.projectId, {
        status: "failed",
        // In development the detail goes on the page too — whoever is
        // looking at the screen is also the person who can fix it.
        error:
          process.env.NODE_ENV === "production"
            ? CUSTOMER_MESSAGE
            : `${CUSTOMER_MESSAGE} (dev detail: ${detail}${hint ? ` — ${hint}` : ""})`,
      });
      return NextResponse.json(project, { status: 502 });
    }
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (error instanceof ProjectLockedError) {
      return NextResponse.json(
        { error: "This design has been submitted and is locked" },
        { status: 409 },
      );
    }
    throw error;
  }
}

/**
 * What a customer is told when segmentation fails.
 *
 * They cannot act on an HTTP status or a request id, and the design is not
 * lost — the band, the swap and the lead all still work without
 * segmentation. So the message says what they can do, and the diagnosis
 * goes to the log where somebody can act on it.
 */
const CUSTOMER_MESSAGE =
  "We couldn't read this one. Try another photo — or carry on and send it anyway, and a rep will take a look.";

/** The one-line fix for the failures an operator actually hits. */
function operatorHint(detail: string): string | null {
  if (/authentication_error|invalid x-api-key|401/i.test(detail)) {
    return "ANTHROPIC_API_KEY was rejected. Check .env.local for a stray quote, space or truncated paste — then RESTART the server, which is the step that reloads it. `npm run doctor` checks all of that.";
  }
  if (/credit balance|billing|402/i.test(detail)) {
    return "The Anthropic account has no credit. Add billing at console.anthropic.com.";
  }
  if (/rate_limit|429/i.test(detail)) {
    return "Rate limited by the Anthropic API — this is upstream, not this app's limiter.";
  }
  if (/ENOTFOUND|ECONNREFUSED|fetch failed|ETIMEDOUT/i.test(detail)) {
    return "Could not reach the Anthropic API — check network access from this machine.";
  }
  return null;
}
