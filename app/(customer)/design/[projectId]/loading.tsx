import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";

/**
 * The design page's first paint. The photo block holds the shape and the
 * aspect ratio the canvas will take, so the customer's own picture drops
 * into place rather than pushing the page around when it arrives.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-5 sm:px-6 sm:pt-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 h-3 w-72" />
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] lg:gap-7">
        <Skeleton className="aspect-[4/3] w-full" rounded="rounded-xl sm:rounded-2xl" />
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-48" />
            <SkeletonText lines={2} />
          </Card>
          <Card className="p-4">
            <SkeletonText lines={3} />
          </Card>
        </div>
      </div>
      <p className="sr-only">Loading your design.</p>
    </main>
  );
}
