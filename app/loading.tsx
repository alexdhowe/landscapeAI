import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/**
 * The root loading state. A generic page shape rather than a spinner, so
 * the first paint has the weight and rhythm of the page that replaces it.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-6">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-8 h-10 w-3/4" />
      <SkeletonText className="mt-5 max-w-xl" lines={3} />
      <Skeleton className="mt-8 h-12 w-52" rounded="rounded-xl" />
      <p className="sr-only">Loading.</p>
    </main>
  );
}
