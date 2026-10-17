import Link from "@/components/link";
import { ArrowDownRightIcon, ArrowUpRightIcon, CheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatAmount, formatDate, formatQty } from "@/lib/format";
import { sameUnit } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { RateHistoryRow } from "@/lib/vendor-history";

/**
 * Quoted and ordered rates, newest first, each in its own unit (with the item's unit beside it when
 * different). "Change" compares with the same vendor's previous rate of the same kind for that item
 * (PO vs previous PO, quote vs previous quote), per the item's unit so Kg and Bag rates compare.
 */
const converted = (r: RateHistoryRow) => !sameUnit(r.uom, r.itemUom);

export function RateHistoryTable({ rows, show, empty }: { rows: RateHistoryRow[]; show: "item" | "vendor"; empty?: string }) {
  if (!rows.length) return <p className="px-4 py-6 text-sm text-muted-foreground">{empty ?? "No quotations or purchase orders yet."}</p>;
  const change = (i: number) => {
    const r = rows[i];
    const prev = rows.slice(i + 1).find((p) => p.itemId === r.itemId && p.vendorId === r.vendorId && p.kind === r.kind);
    if (!prev) return null;
    const [now, before] =
      r.itemRate !== null && prev.itemRate !== null ? [r.itemRate, prev.itemRate] : sameUnit(r.uom, prev.uom) ? [r.rate, prev.rate] : [null, null];
    return now !== null && before ? ((now - before) / before) * 100 : null;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
            <th className="py-2.5 pl-4">Date</th>
            <th className="py-2.5 pr-3">{show === "item" ? "Item" : "Vendor"}</th>
            <th className="py-2.5 pr-3">Source</th>
            <th className="py-2.5 pr-3 text-right">Qty</th>
            <th className="py-2.5 pr-3 text-right">Rate (net)</th>
            <th className="py-2.5 pr-4 text-right">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const c = change(i);
            return (
              <tr key={r.key} className="border-b last:border-b-0">
                <td className="py-2.5 pl-4 whitespace-nowrap tabular">{formatDate(r.date)}</td>
                <td className="py-2.5 pr-3">
                  {show === "item" ? (
                    <Link href={`/items/${r.itemId}`} className="hover:text-primary hover:underline">
                      {r.itemName}
                    </Link>
                  ) : (
                    <Link href={`/vendors/${r.vendorId}`} className="hover:text-primary hover:underline">
                      {r.vendorName}
                    </Link>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-2">
                    {r.kind === "PO" ? (
                      <Badge className="border-transparent bg-primary/10 text-primary">PO</Badge>
                    ) : (
                      <Badge variant="outline">Quote</Badge>
                    )}
                    <Link href={r.href} className="text-muted-foreground hover:text-primary hover:underline">
                      {r.ref}
                    </Link>
                    {r.kind === "QUOTE" && r.selected && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                        <CheckIcon className="size-3" />
                        selected
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-right tabular text-muted-foreground">
                  {r.quantity === null ? "—" : `${formatQty(r.quantity)} ${r.uom}`}
                  {converted(r) && r.itemQty !== null && <div className="text-xs">= {formatQty(r.itemQty)} {r.itemUom}</div>}
                </td>
                <td className="py-2.5 pr-3 text-right font-medium tabular">
                  ₹{formatAmount(r.rate)}
                  <span className="font-normal text-muted-foreground">/{r.uom}</span>
                  {converted(r) && r.itemRate !== null && (
                    <div className="text-xs font-normal text-muted-foreground">
                      ₹{formatAmount(r.itemRate)}/{r.itemUom}
                    </div>
                  )}
                  {!sameUnit(r.uom, r.itemUom) && r.itemRate === null && (
                    <div className="text-xs font-normal text-amber-700 dark:text-amber-400" title={`Add how many ${r.itemUom} one ${r.uom} is (Import from Excel → Unit conversions)`}>
                      {r.uom} → {r.itemUom}: no conversion
                    </div>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-right tabular">
                  {c === null || Math.abs(c) < 0.05 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={cn("inline-flex items-center gap-0.5", c > 0 ? "text-rose-600" : "text-emerald-600")}>
                      {c > 0 ? <ArrowUpRightIcon className="size-3.5" /> : <ArrowDownRightIcon className="size-3.5" />}
                      {Math.abs(c).toFixed(1)}%
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
