/**
 * The loading placeholder.
 *
 * One shimmer for the whole app, so every wait looks like the same thing
 * happening. A skeleton in the shape of the thing being loaded beats a
 * spinner beside it: it tells the customer what is coming and it stops the
 * layout jumping when it arrives.
 */
export function Skeleton({
  className = "",
  rounded = "rounded-md",
}: {
  className?: string;
  rounded?: string;
}) {
  return <div aria-hidden className={`skeleton ${rounded} ${className}`} />;
}

/** A few lines of text-shaped placeholder. */
export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}
