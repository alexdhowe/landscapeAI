import { NextResponse } from "next/server";

import { ProjectNotFoundError, getProjectPhoto } from "@/lib/store/projects";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  try {
    const { bytes, mediaType } = await getProjectPhoto(projectId);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mediaType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    throw error;
  }
}
