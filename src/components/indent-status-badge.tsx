import { Badge } from "@/components/ui/badge";
import type { IndentStatus } from "@/generated/prisma/enums";
import { INDENT_STATUS } from "@/lib/indent-status";
import { cn } from "@/lib/utils";

export function IndentStatusBadge({ status, className }: { status: IndentStatus; className?: string }) {
  const s = INDENT_STATUS[status];
  return (
    <Badge className={cn("gap-1.5 border-transparent", s.tone, className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {s.label}
    </Badge>
  );
}

export function UrgentBadge() {
  return <Badge className="border-transparent bg-rose-600 text-white">Urgent</Badge>;
}
