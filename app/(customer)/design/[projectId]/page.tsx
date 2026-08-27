import type { Metadata } from "next";

import { Configurator } from "@/components/configurator/Configurator";
import { ByPointer } from "@/components/ui/ByPointer";

export const metadata: Metadata = {
  title: "Your design",
  description: "Swap what's in your yard and watch the budget range follow.",
};

export default async function DesignPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-5 sm:px-6 sm:pt-8">
      <header className="mb-4 sm:mb-6">
        <h1 className="display text-2xl text-bark-900 sm:text-3xl">
          Your yard, your call
        </h1>
        <p className="mt-1 text-sm text-bark-600">
          <ByPointer
            touch="Tap a labelled area, swap what's in it, watch the budget follow."
            pointer="Click a labelled area, swap what's in it, watch the budget follow."
          />
        </p>
      </header>
      <Configurator projectId={projectId} />
    </main>
  );
}
