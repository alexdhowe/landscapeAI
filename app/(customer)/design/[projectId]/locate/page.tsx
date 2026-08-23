import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocateFlow } from "@/components/locate/LocateFlow";
import { locateEnabled } from "@/lib/locate/gate";

export const metadata: Metadata = {
  title: "Measure your yard",
  description:
    "Add an address, outline your areas on the aerial, and watch the budget range narrow.",
};

export default async function LocatePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  // The aerial leg is licensed, not built: until the imagery and geocoder
  // terms are declared, this surface does not exist. See lib/locate/gate.ts
  // — the customer keeps their design and a typology band without it.
  if (!locateEnabled()) notFound();
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-5 sm:px-6 sm:pt-8">
      <header className="mb-4 sm:mb-6">
        <h1 className="display text-2xl text-bark-900 sm:text-3xl">
          Measure your actual yard
        </h1>
        <p className="mt-1 text-sm text-bark-600">
          Outline your areas on the aerial and watch the budget range narrow to
          your property.
        </p>
      </header>
      <LocateFlow projectId={projectId} />
    </main>
  );
}
