import { cn } from "@/lib/utils";

/** One grey block. Same token in both themes; still under reduced motion. Compositions: src/components/skeletons. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-[6px] bg-foreground/[0.06] motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Skeleton };
