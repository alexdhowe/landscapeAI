import { photoResponse } from "@/app/api/photoResponse";
import { requireContractor } from "@/lib/auth/guard";

type Params = { params: Promise<{ projectId: string }> };

/**
 * The same photo, read as the contractor.
 *
 * The console renders a lead's photo from here rather than from the
 * customer's open route. Nothing about the bytes differs — what differs is
 * that this door needs a session, so a contractor surface never depends on
 * an unauthenticated one. It is also the half of the access decision that
 * is not up for debate: the console is behind a login, and everything it
 * loads should be too.
 */
export async function GET(request: Request, { params }: Params) {
  const { response } = await requireContractor(request);
  if (response) return response;
  const { projectId } = await params;
  return photoResponse(projectId);
}
