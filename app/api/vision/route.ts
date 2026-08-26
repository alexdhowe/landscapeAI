import { NextResponse } from "next/server";

import { imagePixels } from "@/lib/image/dimensions";
import { classifyPhoto, refinementEnabled } from "@/lib/vision/classify";
import { estimateSegmentation, refineEstimateFrom } from "@/lib/vision/estimate";
import { isVisionMediaType } from "@/lib/vision/mediaTypes";
import { formatEstimateAccuracy } from "@/lib/vision/timing";
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
 *
 * The call takes 55–170 seconds, so this route also keeps a running
 * account of the wait on the project: an estimate before it starts, and a
 * stage transition when the first pass lands. The design page polls that
 * while the request it made is still open, which is what lets the
 * customer's progress bar be a report rather than an animation.
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
  // Held in a const because the progress callback below is a closure, and
  // a narrowed `let` does not stay narrowed inside one.
  const projectId = body.projectId;

  try {
    await getProject(projectId);
    const { bytes, mediaType } = await getProjectPhoto(projectId);
    // The upload route normalises everything into this list, so a stored
    // photo outside it is a bug here rather than a bad upload.
    if (!isVisionMediaType(mediaType)) {
      return NextResponse.json({ error: "Stored photo has unsupported type" }, { status: 500 });
    }

    // Sized from the stored photo's own pixel count, read out of its
    // header rather than by decoding it — the estimate must not cost the
    // customer a second of the wait it is describing.
    const pixels = imagePixels(bytes);
    const estimate = estimateSegmentation(pixels, { refine: refinementEnabled() });
    const startedAt = new Date().toISOString();
    await setSegmentation(projectId, {
      status: "pending",
      progress: { startedAt, stage: "reading", estimate },
    });

    const started = Date.now();
    try {
      const segmentation = await classifyPhoto(bytes, mediaType, async (first) => {
        // Only worth recording if something is still to come. When the
        // first pass is the whole job this write would land at the same
        // moment as the answer itself.
        if (!first.refining) return;
        await setSegmentation(projectId, {
          status: "pending",
          progress: {
            startedAt,
            stage: "refining",
            // The remaining half is now a measurement rather than a
            // guess: it is a multiple of what the first pass just took.
            estimate: {
              ...estimate,
              firstPassMs: first.firstPassMs,
              refineMs: refineEstimateFrom(first.firstPassMs),
              totalMs: first.firstPassMs + refineEstimateFrom(first.firstPassMs),
            },
            firstPassMs: first.firstPassMs,
            found: first.found,
          },
        });
      });
      console.info(
        formatEstimateAccuracy(
          estimate.totalMs,
          Date.now() - started,
          pixels === null ? null : pixels / 1_000_000,
        ),
      );
      const project = await setSegmentation(projectId, {
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

      const project = await setSegmentation(projectId, {
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
 * They cannot act on an HTTP status or a request id, so the message says
 * what they can do and the diagnosis goes to the log where somebody can
 * act on it.
 *
 * It used to end "or carry on and send it anyway, and a rep will take a
 * look", which was not true. A failed segmentation has no regions, so
 * there is nothing to tap, nothing to swap, no band, and POST
 * /submit answers 409 for a design with no selections. Inviting the
 * customer to send it anyway sends them looking for a button that is not
 * there. Sending a photo with no design *should* be possible — see
 * "product gaps" in the README — but until it is, this says the true
 * thing.
 */
const CUSTOMER_MESSAGE =
  "We couldn't read this one — nothing on your photo got labelled, so there's nothing to change yet. Another photo, taken a few steps further back, usually does it.";

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
