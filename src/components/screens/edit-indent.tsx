import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { toDateInput } from "@/lib/format";
import { IndentForm } from "@/app/(app)/indents/indent-form";
import type { loadEditIndentForm } from "@/lib/screens/forms";

type Data = NonNullable<Awaited<ReturnType<typeof loadEditIndentForm>>>;
export type EditIndentViewProps = Pick<Data, "indent" | "items"> & {
  id: number;
};

export function EditIndentView({ id, indent, items }: EditIndentViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <BackLink href={`/indents/${id}`}>{indent.indentNumber}</BackLink>
        }
        title={`Edit ${indent.indentNumber}`}
      />
      <IndentForm
        indentId={id}
        items={items}
        initial={{
          department: indent.department ?? "",
          priority: indent.priority,
          requiredBy: toDateInput(indent.requiredBy),
          purpose: indent.purpose ?? "",
          items: indent.items.map((l) => ({
            itemId: l.itemId,
            description: l.description,
            quantity: l.quantity.toString(),
            currentStock: l.currentStock?.toString() ?? "",
            remarks: l.remarks ?? "",
            uom: l.uom,
          })),
        }}
      />
    </div>
  );
}
