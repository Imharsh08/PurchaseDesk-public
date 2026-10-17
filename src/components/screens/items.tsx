import Link from "@/components/link";
import { BoxesIcon, PencilIcon, PlusIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { SortableTable } from "@/components/sortable-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatQty } from "@/lib/format";
import { ItemDialog } from "@/app/(app)/items/item-dialog";
import type { loadItemList } from "@/lib/screens/masters";

type Data = NonNullable<Awaited<ReturnType<typeof loadItemList>>>;
export type ItemsViewProps = Pick<Data, "categories" | "items"> & {
  canEdit: boolean;
  query: string;
};

export function ItemsView({ canEdit, categories, items, query }: ItemsViewProps) {
  const toForm = (i: (typeof items)[number]) => ({
    ...i,
    gstRate: i.gstRate.toString(),
    minStock: i.minStock?.toString() ?? null,
    reorderQty: i.reorderQty?.toString() ?? null,
    packSize: i.packSize?.toString() ?? null,
    currentStock: i.currentStock?.toString() ?? null,
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Items"
        description="Materials and consumables you purchase, with HSN and GST defaults."
        actions={
          canEdit && (
            <ItemDialog
              categories={categories}
              trigger={
                <Button>
                  <PlusIcon />
                  Add item
                </Button>
              }
            />
          )
        }
      />

      <Card className="gap-0 py-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <SearchInput placeholder="Search name, code, category, HSN" />
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {items.length} item{items.length === 1 ? "" : "s"}
          </span>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={BoxesIcon}
            title={query ? "No items match your search" : "No items yet"}
            description={query ? "Try a different name or code." : "Add the materials you buy so they can be picked on purchase orders."}
          />
        ) : (
          <SortableTable
            columns={[
              { key: "name", label: "Item", className: "pl-4" },
              { key: "category", label: "Category" },
              { key: "uom", label: "UOM" },
              { key: "hsn", label: "HSN" },
              { key: "gst", label: "GST", className: "text-right tabular", numeric: true },
              { key: "vendors", label: "Vendors", className: "text-right tabular", numeric: true },
              { key: "status", label: "Status" },
              ...(canEdit ? [{ key: "edit", label: "", className: "w-12 pr-4", sortable: false }] : []),
            ]}
            rows={items.map((item) => ({
              key: item.id,
              sort: {
                name: item.name,
                category: item.category,
                uom: item.uom,
                hsn: item.hsnCode,
                gst: Number(item.gstRate),
                vendors: item._count.vendors,
                status: item.active ? "Active" : "Inactive",
              },
              cells: {
                name: (
                  <>
                    <Link href={`/items/${item.id}`} className="font-medium hover:text-primary hover:underline">
                      {item.name}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{item.sku}</div>
                  </>
                ),
                category: item.category ? <Badge variant="outline">{item.category}</Badge> : <span className="text-muted-foreground">—</span>,
                uom: item.uom,
                hsn: <span className="font-mono text-xs">{item.hsnCode ?? "—"}</span>,
                gst: `${formatQty(item.gstRate)}%`,
                vendors: item._count.vendors || <span className="text-muted-foreground">—</span>,
                status: item.active ? (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Active</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                ),
                edit: canEdit && (
                  <ItemDialog
                    item={toForm(item)}
                    categories={categories}
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.name}`}>
                        <PencilIcon />
                      </Button>
                    }
                  />
                ),
              },
            }))}
          />
        )}
      </Card>
    </div>
  );
}
