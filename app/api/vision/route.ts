import { NextResponse } from "next/server";

import {
  SUPPORTED_IMAGE_MEDIA_TYPES,
  classifyPhoto,
  type SupportedImageMediaType,
} from "@/lib/vision/classify";
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
    if (!SUPPORTED_IMAGE_MEDIA_TYPES.includes(mediaType as SupportedImageMediaType)) {
      return NextResponse.json({ error: "Stored photo has unsupported type" }, { status: 500 });
    }

    try {
      const segmentation = await classifyPhoto(bytes, mediaType as SupportedImageMediaType);
      const project = await setSegmentation(body.projectId, {
        status: "ready",
        ...segmentation,
      });
      return NextResponse.json(project);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vision analysis failed";
      const project = await setSegmentation(body.projectId, {
        status: "failed",
        error: message,
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
