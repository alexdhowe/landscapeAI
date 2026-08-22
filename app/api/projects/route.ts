import { NextResponse } from "next/server";

import {
  SUPPORTED_IMAGE_MEDIA_TYPES,
  type SupportedImageMediaType,
} from "@/lib/vision/classify";
import { StorageConfigError } from "@/lib/storage";
import { createProject } from "@/lib/store/projects";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/**
 * POST multipart/form-data with a "photo" file → a new play-stage project.
 *
 * The bytes go through lib/storage — the configured bucket when there is
 * one, this deployment when there is not — and the project records only
 * the locator it minted. This route has no opinion about which.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a 'photo' file" },
      { status: 400 },
    );
  }

  const photo = form.get("photo");
  if (!(photo instanceof File)) {
    return NextResponse.json({ error: "Missing 'photo' file" }, { status: 400 });
  }
  const mediaType = photo.type as SupportedImageMediaType;
  if (!SUPPORTED_IMAGE_MEDIA_TYPES.includes(mediaType)) {
    return NextResponse.json(
      { error: `Unsupported image type "${photo.type}" — use JPEG, PNG, GIF, or WebP` },
      { status: 415 },
    );
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { error: "Photo too large — 8 MB max" },
      { status: 413 },
    );
  }

  const bytes = Buffer.from(await photo.arrayBuffer());
  try {
    const project = await createProject(bytes, mediaType);
    return NextResponse.json({ projectId: project.id }, { status: 201 });
  } catch (error) {
    // Half-configured object storage is the operator's mistake, not the
    // customer's, and it must not be answered by quietly writing the photo
    // somewhere else. Say so in the log; say nothing about it in the body.
    if (error instanceof StorageConfigError) {
      console.error("[photo upload] object storage is misconfigured:", error.message);
      return NextResponse.json(
        { error: "Photo storage is unavailable — try again shortly" },
        { status: 503 },
      );
    }
    throw error;
  }
}
