import { NextResponse } from "next/server";

import { requireContractor } from "@/lib/auth/guard";
import { setRecipe } from "@/lib/pricebook/mutate";
import { ParseError, parseRecipe } from "@/lib/pricebook/parse";
import { editDraft } from "@/lib/pricebook/service";
import type { JobType } from "@/lib/pricing/typology";

import { pricebookError } from "../../errors";

type Params = { params: Promise<{ jobType: string }> };

const JOB_TYPES: JobType[] = [
  "bed_renovation",
  "mulch_to_stone",
  "foundation_planting_refresh",
];

/**
 * PUT { lines: [{ assemblyId, distributionKey }] } → what a typical job of
 * this type is made of.
 *
 * This is what the opening band is computed from, so it is the most
 * load-bearing thing on this surface: change it and the first number a
 * customer ever sees changes.
 */
export async function PUT(request: Request, { params }: Params) {
  const auth = await requireContractor(request, "admin");
  if (auth.response) return auth.response;
  const { jobType } = await params;
  try {
    if (!JOB_TYPES.includes(jobType as JobType)) {
      throw new ParseError(`"${jobType}" is not a job type`);
    }
    const lines = parseRecipe(await request.json());
    const view = await editDraft(auth.contractor.name || auth.contractor.email, (config) =>
      setRecipe(config, jobType as JobType, lines),
    );
    return NextResponse.json(view);
  } catch (error) {
    return pricebookError(error);
  }
}
