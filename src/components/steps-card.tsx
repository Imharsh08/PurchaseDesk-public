import Link from "@/components/link";
import { IndentTimeline } from "@/components/indent-timeline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Timeline } from "@/lib/screens/timeline";

/**
 * "Where it is now" on a PO, receipt or bill page: this PO's FMS steps with who does each and the
 * button for the step that is due (src/lib/screens/timeline.ts). `highlight` marks this receipt's lot.
 */
export function StepsCard({ timeline, highlight }: { timeline: Timeline; highlight?: string }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Where it is now</CardTitle>
        <CardDescription>
          FMS steps of{" "}
          <Link href={`/indents/${timeline.indentId}`} className="font-medium text-primary hover:underline">
            {timeline.indentNumber}
          </Link>
          , with who does each
          {timeline.otherPos > 0 && ` · ${timeline.otherPos} other PO${timeline.otherPos === 1 ? "" : "s"} on the indent`}
        </CardDescription>
      </CardHeader>
      <CardContent className="max-h-[calc(100vh-12rem)] overflow-y-auto py-4">
        <IndentTimeline rows={timeline.rows} assigned={timeline.assigned} canDo={timeline.canDo} draft={false} highlight={highlight} />
      </CardContent>
    </Card>
  );
}
