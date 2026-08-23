import type { Metadata } from "next";

import { LocateFlow } from "@/components/locate/LocateFlow";

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
