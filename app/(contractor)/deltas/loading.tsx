import { Card } from "@/components/ui/Card";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** Estimation error: headline figures, then a table. */
export default function Loading() {
  return (
    <div>
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-2 h-3 w-80" />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="space-y-2 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </Card>
        ))}
      </div>
      <Card className="mt-5 space-y-3 p-5">
        <SkeletonText lines={5} />
      </Card>
      <p className="sr-only">Loading estimation error.</p>
    </div>
  );
}
