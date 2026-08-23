import type { Metadata } from "next";

import TimeSliderDemo from "@/components/timeslider/TimeSliderDemo";
import { Wordmark } from "@/components/ui/Wordmark";

export const metadata: Metadata = {
  title: "Your landscape over time",
  description:
    "A sample planting at year 1, 3 and 5 — only the plants change, the beds and hardscape do not.",
};

/**
 * Phase 3.5 demo route. When the slider moves into /design/[projectId] and
 * reads real placements, this page keeps the growth engine visible on its
 * own.
 */
export default function TimeSliderDemoPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-bark-200 bg-white/85 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-5 sm:px-6">
          <Wordmark />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-12 pt-6 sm:px-6 sm:pt-10">
        <h1 className="display text-2xl text-bark-900 sm:text-3xl">
          Your landscape over time
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-bark-600 sm:text-base">
          A sample design — mixed shrubs, grasses, and one serviceberry. Drag
          across year 1, 3 and 5 to watch the planting fill in. The beds,
          hardscape and house are identical in every frame; only the plants
          change.
        </p>
        <TimeSliderDemo />
      </main>
    </div>
  );
}
