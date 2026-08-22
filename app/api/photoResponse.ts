/**
 * Serving a project's photo, shared by the customer's route and the
 * contractor's.
 *
 * One reader, two doors: the customer's is open to whoever holds the
 * project UUID and the contractor's is behind the auth guard. Both stream
 * the bytes through this app — no browser is ever handed a bucket URL,
 * because the bucket is private. The reasoning behind that split is in
 * lib/storage/index.ts, under "Who may read a photo".
 */
import { NextResponse } from "next/server";

import {
  PhotoObjectNotFoundError,
  StorageBackendError,
  StorageConfigError,
} from "@/lib/storage";
import { ProjectNotFoundError, getProjectPhoto } from "@/lib/store/projects";

export async function photoResponse(projectId: string): Promise<NextResponse> {
  try {
    const { bytes, mediaType } = await getProjectPhoto(projectId);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mediaType,
        // private: a shared cache must not hold somebody's house. immutable:
        // a project's photo never changes — re-uploading starts a new project.
        "Cache-Control": "private, max-age=31536000, immutable",
        // Belt and braces on a URL that is only as secret as the UUID in it.
        "X-Robots-Tag": "noindex, noimageindex",
      },
    });
  } catch (error) {
    if (error instanceof ProjectNotFoundError || error instanceof PhotoObjectNotFoundError) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    // The project exists and its bytes are somewhere this deployment can't
    // reach — a bucket that is down, or one that was configured and then
    // unset. That is a 502, not a missing project: telling a contractor the
    // lead does not exist would be a lie with consequences.
    if (error instanceof StorageBackendError || error instanceof StorageConfigError) {
      console.error("[photo] storage unavailable:", error.message);
      return NextResponse.json({ error: "Photo storage is unavailable" }, { status: 502 });
    }
    throw error;
  }
}
