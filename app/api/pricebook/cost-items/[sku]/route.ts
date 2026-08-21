import { NextResponse } from "next/server";

import { requireContractor } from "@/lib/auth/guard";
import { removeCostItem, upsertCostItem } from "@/lib/pricebook/mutate";
import { parseCostItem } from "@/lib/pricebook/parse";
import { editDraft } from "@/lib/pricebook/service";

import { pricebookError } from "../../errors";

type Params = { params: Promise<{ sku: string }> };

/** PUT → create or replace one cost item in the draft. */
export async function PUT(request: Request, { params }: Params) {
  const auth = await requireContractor(request, "admin");
  if (auth.response) return auth.response;
  const { sku } = await params;
  try {
    const item = parseCostItem(await request.json(), sku);
    const view = await editDraft(auth.contractor.name || auth.contractor.email, (config) =>
      upsertCostItem(config, item),
    );
    return NextResponse.json(view);
  } catch (error) {
    return pricebookError(error);
  }
}

/**
 * DELETE → remove one cost item from the draft.
 *
 * Refuses when assemblies price with it. A cascade here would quietly
 * rewrite every assembly that used it, which is not what anyone means by
 * deleting a SKU.
 */
export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireContractor(request, "admin");
  if (auth.response) return auth.response;
  const { sku } = await params;
  try {
    const view = await editDraft(auth.contractor.name || auth.contractor.email, (config) =>
      removeCostItem(config, sku),
    );
    return NextResponse.json(view);
  } catch (error) {
    return pricebookError(error);
  }
}
