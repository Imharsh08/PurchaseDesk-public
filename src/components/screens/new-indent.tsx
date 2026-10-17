import Link from "@/components/link";
import { BackLink } from "@/components/back-link";
import { BoxesIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IndentForm } from "@/app/(app)/indents/indent-form";
import type { ScreenUser } from "@/components/screens/types";
import type { loadNewIndentForm } from "@/lib/screens/forms";

type Data = NonNullable<Awaited<ReturnType<typeof loadNewIndentForm>>>;
export type NewIndentViewProps = Pick<Data, "items" | "lines"> & {
  user: ScreenUser;
};

export function NewIndentView({ items, lines, user }: NewIndentViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <BackLink href={lines.length ? "/stock" : "/indents"}>{lines.length ? "Stock" : "Indents"}</BackLink>
        }
        title="New indent"
        description={
          lines.length
            ? `Pre-filled with ${lines.length} item${lines.length === 1 ? "" : "s"} below minimum stock and their suggested quantities. Adjust if needed.`
            : "Raise a requirement. Purchase will collect at least three quotations and get the vendor approved."
        }
      />
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={BoxesIcon}
            title="Add items first"
            description="Indents are raised against items in the item master."
            action={
              <Button asChild>
                <Link href="/items">Go to items</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <IndentForm
          items={items}
          initial={{
            department: user.department ?? "",
            priority: "NORMAL",
            requiredBy: "",
            purpose: lines.length ? "Stock below minimum level (from stock dashboard)" : "",
            items: lines,
          }}
        />
      )}
    </div>
  );
}
