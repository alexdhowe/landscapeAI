import { NextResponse } from "next/server";

import { MAX_UPLOAD_BYTES, megabytes } from "@/lib/image/limits";
import { UnsupportedImageError, normalizePhoto } from "@/lib/image/normalize";
import { StorageConfigError } from "@/lib/storage";
import { createProject } from "@/lib/store/projects";

/**
 * POST multipart/form-data with a "photo" file → a new play-stage project.
 *
 * The only place in the application that handles raw uploaded bytes, which
 * is why normalisation belongs here: what leaves this route is always a
 * format the vision API reads, upright, capped at 1600px on the long edge,
 * and carrying no metadata. Everything downstream — storage, the vision
 * route, the photo response — sees a picture it already understands.
 *
 * The bytes then go through lib/storage — the configured bucket when there
 * is one, this deployment when there is not — and the project records only
 * the locator it minted. This route has no opinion about which.
 */
export async function POST(request: Request) {
  // The size check happens before the body is buffered where the client
  // declared one: a 200 MB upload should not be read into memory to find
  // out it is too big.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: tooLarge() }, { status: 413 });
  }

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
  if (photo.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: tooLarge() }, { status: 413 });
  }

  const uploaded = Buffer.from(await photo.arrayBuffer());

  let normalized;
  try {
    // The browser's File.type is passed only so the refusal can name what
    // the customer thinks they sent; the decision is made from the bytes.
    normalized = await normalizePhoto(uploaded, photo.type);
  } catch (error) {
    if (error instanceof UnsupportedImageError) {
      return NextResponse.json({ error: error.message }, { status: 415 });
    }
    throw error;
  }

  try {
    const project = await createProject(normalized.bytes, normalized.mediaType);
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

function tooLarge(): string {
  return `That photo is over ${megabytes(MAX_UPLOAD_BYTES)} MB — try one straight from your camera.`;
}
