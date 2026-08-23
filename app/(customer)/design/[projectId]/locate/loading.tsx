import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** The aerial page: the map is the page, so the map is the skeleton. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12 pt-5 sm:px-6 sm:pt-8">
      <Skeleton className="h-8 w-64" />
      <SkeletonText className="mt-3 max-w-md" lines={2} />
      <Skeleton className="mt-6 h-[60vh] min-h-80 w-full" rounded="rounded-xl" />
      <p className="sr-only">Loading the map.</p>
    </main>
  );
}
