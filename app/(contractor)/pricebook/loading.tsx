import { Card } from "@/components/ui/Card";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** The price book is four stacked sections; hold their shape. */
export default function Loading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-7 w-40" />
      {[0, 1, 2].map((i) => (
        <Card key={i} className="space-y-4 p-5">
          <Skeleton className="h-3 w-32" />
          <SkeletonText lines={4} />
        </Card>
      ))}
      <p className="sr-only">Loading the price book.</p>
    </div>
  );
}
