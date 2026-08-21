import { NextResponse } from "next/server";

import { requireContractor } from "@/lib/auth/guard";
import { removeAssembly, upsertAssembly } from "@/lib/pricebook/mutate";
import { parseAssembly } from "@/lib/pricebook/parse";
import { editDraft } from "@/lib/pricebook/service";

import { pricebookError } from "../../errors";

type Params = { params: Promise<{ key: string }> };

/** PUT → create or replace one assembly, components included, in the draft. */
export async function PUT(request: Request, { params }: Params) {
  const auth = await requireContractor(request, "admin");
  if (auth.response) return auth.response;
  const { key } = await params;
  try {
    const assembly = parseAssembly(await request.json(), key);
    const view = await editDraft(auth.contractor.name || auth.contractor.email, (config) =>
      upsertAssembly(config, assembly),
    );
    return NextResponse.json(view);
  } catch (error) {
    return pricebookError(error);
  }
}

/** DELETE → remove one assembly. Refuses when the opening band is built from it. */
export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireContractor(request, "admin");
  if (auth.response) return auth.response;
  const { key } = await params;
  try {
    const view = await editDraft(auth.contractor.name || auth.contractor.email, (config) =>
      removeAssembly(config, key),
    );
    return NextResponse.json(view);
  } catch (error) {
    return pricebookError(error);
  }
}
