import { Card } from "@/components/ui/Card";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <Card className="w-full max-w-sm space-y-4 p-6">
        <Skeleton className="h-5 w-44" />
        <SkeletonText lines={2} />
        <Skeleton className="h-11 w-full" rounded="rounded-lg" />
        <Skeleton className="h-11 w-full" rounded="rounded-lg" />
      </Card>
      <p className="sr-only">Loading sign in.</p>
    </div>
  );
}
