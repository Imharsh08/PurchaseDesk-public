import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/dal";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Import from Excel" };

export default async function ImportPage() {
  await requirePermission("importData");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Import from Excel"
        description="Load items, vendors, opening stock, vendor items (who supplies what) and unit conversions in bulk. Each row is checked; rows with errors are skipped and listed."
      />
      <Importer />
    </div>
  );
}
