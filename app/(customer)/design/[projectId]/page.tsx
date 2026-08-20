import { Configurator } from "@/components/configurator/Configurator";

export default async function DesignPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Your yard, your call
        </h1>
        <p className="text-sm text-neutral-500">
          Click a labeled area, swap what&apos;s in it, watch the budget follow.
        </p>
      </header>
      <Configurator projectId={projectId} />
    </main>
  );
}
