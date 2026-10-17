import { Badge } from "@/components/ui/badge";
import type { POStatus } from "@/generated/prisma/enums";
import { PO_STATUS } from "@/lib/po-status";
import { cn } from "@/lib/utils";

export function POStatusBadge({ status, className }: { status: POStatus; className?: string }) {
  const s = PO_STATUS[status];
  return (
    <Badge className={cn("gap-1.5 border-transparent", s.tone, className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {s.label}
    </Badge>
  );
}
