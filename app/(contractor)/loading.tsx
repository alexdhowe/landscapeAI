import { Card } from "@/components/ui/Card";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** The console's first paint: a heading and a few rows in place. */
export default function Loading() {
  return (
    <div>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-3 w-72" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="space-y-3 p-4">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <SkeletonText lines={2} />
          </Card>
        ))}
      </div>
      <p className="sr-only">Loading.</p>
    </div>
  );
}
