import { LocateFlow } from "@/components/locate/LocateFlow";

export default async function LocatePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Measure your actual yard
        </h1>
        <p className="text-sm text-neutral-500">
          Outline your areas on the aerial and watch the budget range narrow to
          your property.
        </p>
      </header>
      <LocateFlow projectId={projectId} />
    </main>
  );
}
