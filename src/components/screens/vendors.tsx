import Link from "@/components/link";
import { MailIcon, PencilIcon, PhoneIcon, PlusIcon, StoreIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { SortableTable } from "@/components/sortable-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { stateName } from "@/lib/states";
import { VendorDialog } from "@/app/(app)/vendors/vendor-dialog";
import type { loadVendorList } from "@/lib/screens/masters";

type Data = NonNullable<Awaited<ReturnType<typeof loadVendorList>>>;
export type VendorsViewProps = Pick<Data, "vendors"> & {
  canEdit: boolean;
  perf: Data["performance"];
  query: string;
  transport?: Data["transport"];
};

export function VendorsView({ canEdit, perf, query, transport, vendors }: VendorsViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        description="Suppliers you raise purchase orders against."
        actions={
          canEdit && (
            <VendorDialog
              transport={transport}
              trigger={
                <Button>
                  <PlusIcon />
                  Add vendor
                </Button>
              }
            />
          )
        }
      />

      <Card className="gap-0 py-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <SearchInput placeholder="Search name, code, GSTIN, city" />
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {vendors.length} vendor{vendors.length === 1 ? "" : "s"}
          </span>
        </div>

        {vendors.length === 0 ? (
          <EmptyState
            icon={StoreIcon}
            title={query ? "No vendors match your search" : "No vendors yet"}
            description={query ? "Try a different name, code or GSTIN." : "Add your first supplier to start raising purchase orders."}
          />
        ) : (
          <SortableTable
            columns={[
              { key: "name", label: "Vendor", className: "pl-4" },
              { key: "contact", label: "Contact" },
              { key: "location", label: "Location" },
              { key: "gstin", label: "GSTIN" },
              { key: "items", label: "Items", className: "text-right tabular", numeric: true },
              { key: "pos", label: "POs", className: "text-right tabular", numeric: true },
              { key: "onTime", label: "On time", className: "text-right tabular", numeric: true },
              { key: "issues", label: "Issues", className: "text-right tabular", numeric: true },
              { key: "status", label: "Status" },
              ...(canEdit ? [{ key: "edit", label: "", className: "w-12 pr-4", sortable: false }] : []),
            ]}
            rows={vendors.map((v) => {
              const location = [v.city, stateName(v.stateCode)].filter(Boolean).join(", ");
              const onTime = perf[v.id]?.onTimePct ?? null;
              return {
                key: v.id,
                sort: {
                  name: v.name,
                  contact: v.contactPerson,
                  location: location || null,
                  gstin: v.gstin,
                  items: v._count.items,
                  pos: v._count.purchaseOrders,
                  onTime,
                  issues: v._count.issues,
                  status: v.active ? "Active" : "Inactive",
                },
                cells: {
                  name: (
                    <>
                      <Link href={`/vendors/${v.id}`} className="font-medium hover:text-primary hover:underline">
                        {v.name}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{v.code}</div>
                    </>
                  ),
                  contact: (
                    <>
                      <div className="text-sm">{v.contactPerson ?? "—"}</div>
                      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                        {v.email && (
                          <span className="flex items-center gap-1">
                            <MailIcon className="size-3" />
                            {v.email}
                          </span>
                        )}
                        {v.phone && (
                          <span className="flex items-center gap-1">
                            <PhoneIcon className="size-3" />
                            {v.phone}
                          </span>
                        )}
                      </div>
                    </>
                  ),
                  location: <span className="text-sm">{location || "—"}</span>,
                  gstin: <span className="font-mono text-xs">{v.gstin ?? "—"}</span>,
                  items: v._count.items,
                  pos: v._count.purchaseOrders,
                  onTime: onTime == null ? <span className="text-muted-foreground">—</span> : `${onTime}%`,
                  issues: <span className={v._count.issues ? "font-medium text-rose-600" : "text-muted-foreground"}>{v._count.issues || "—"}</span>,
                  status: v.active ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  ),
                  edit: canEdit && (
                    <VendorDialog
                      vendor={v}
                      transport={transport}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${v.name}`}>
                          <PencilIcon />
                        </Button>
                      }
                    />
                  ),
                },
              };
            })}
          />
        )}
      </Card>
    </div>
  );
}
