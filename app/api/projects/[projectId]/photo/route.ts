import { photoResponse } from "@/app/api/photoResponse";

type Params = { params: Promise<{ projectId: string }> };

/**
 * The customer's photo, on their own design page. Deliberately open to
 * whoever holds the project UUID: the customer never signs in, and that
 * UUID is already the credential for the design, the snapshot and the
 * quote. The full reasoning — and what would have to change to tighten it —
 * is in lib/storage/index.ts under "Who may read a photo".
 *
 * The contractor console does NOT read through here: it uses the guarded
 * /api/leads/[projectId]/photo, so this route can be tightened later
 * without touching the console.
 */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  return photoResponse(projectId);
}
