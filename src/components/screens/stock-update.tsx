import Link from "@/components/link";
import { BackLink } from "@/components/back-link";
import { BoxesIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StockCountForm } from "@/app/(app)/stock/update/stock-count-form";
import type { loadStockUpdateForm } from "@/lib/screens/forms";

type Data = NonNullable<Awaited<ReturnType<typeof loadStockUpdateForm>>>;
export type StockUpdateViewProps = Pick<Data, "items">;

export function StockUpdateView({ items }: StockUpdateViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <BackLink href="/stock">Stock</BackLink>
        }
        title="Update stock"
        description="Enter today's counted stock. Only items you fill in are saved; click a last count to copy it."
      />
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={BoxesIcon}
            title="No items yet"
            description="Add items (with minimum stock and pack size) before counting stock."
            action={
              <Button asChild>
                <Link href="/items">Go to items</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <StockCountForm
          items={items.map((r) => ({
            id: r.id,
            sku: r.sku,
            name: r.name,
            category: r.category,
            uom: r.uom,
            packUnit: r.packUnit,
            packSize: r.packSize,
            minStock: r.minStock,
            current: r.current,
            updatedAt: r.updatedAt,
            updatedBy: r.updatedBy,
            stale: r.stale,
          }))}
        />
      )}
    </div>
  );
}
