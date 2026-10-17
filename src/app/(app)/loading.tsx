import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Shown instantly while a page's data loads, so navigation never looks frozen. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Card className="gap-0 py-0">
        <div className="flex gap-4 border-b px-4 py-4">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-24" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        ))}
      </Card>
    </div>
  );
}
