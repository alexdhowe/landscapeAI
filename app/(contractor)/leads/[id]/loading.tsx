import { Card } from "@/components/ui/Card";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** The lead detail: photo, quantities table, internal estimate. */
export default function Loading() {
  return (
    <div>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-56" />
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
        <div className="space-y-4">
          <Skeleton className="aspect-[4/3] w-full" rounded="rounded-xl" />
          <Card className="space-y-3 p-4">
            <SkeletonText lines={4} />
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-40" />
            <SkeletonText lines={3} />
          </Card>
        </div>
      </div>
      <p className="sr-only">Loading this lead.</p>
    </div>
  );
}
