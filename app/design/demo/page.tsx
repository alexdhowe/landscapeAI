import TimeSliderDemo from "../../../components/timeslider/TimeSliderDemo";

export const metadata = {
  title: "Time slider demo — LandscapeAI",
};

/**
 * Phase 3.5 demo route. When the Phase 2/3 configurator lands, the slider
 * moves into /design/[projectId] and reads real placements; this page keeps
 * the growth engine visible until then.
 */
export default function TimeSliderDemoPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="mx-auto max-w-5xl px-6 pt-8">
        <h1 className="text-xl font-semibold text-neutral-900">
          Your landscape over time
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Sample design — mixed shrubs, grasses, and one serviceberry. Drag
          across year 1, 3, and 5 to watch the planting fill in.
        </p>
      </header>
      <TimeSliderDemo />
    </main>
  );
}
