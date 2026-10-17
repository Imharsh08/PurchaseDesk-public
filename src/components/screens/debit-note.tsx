import { amountInWords, formatAmount, formatDate, formatQty } from "@/lib/format";
import { stateName } from "@/lib/states";
import { PrintButton } from "@/app/debit-note/[id]/print-button";
import type { loadDebitNoteScreen } from "@/lib/screens/debit-note";

/** Printable debit note for amounts deducted from a vendor bill (excess qty / rate, other deductions). */

type Data = NonNullable<Awaited<ReturnType<typeof loadDebitNoteScreen>>>;
export type DebitNoteViewProps = Pick<Data, "bill" | "company" | "other" | "rows" | "total">;

export function DebitNoteView({ bill, company, other, rows, total }: DebitNoteViewProps) {
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-[13px] text-black print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <header className="flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <div className="text-xl font-bold">{company.name}</div>
          <div className="whitespace-pre-line">{company.address}</div>
          <div>{[company.city, stateName(company.stateCode), company.pincode].filter(Boolean).join(", ")}</div>
          {company.gstin && <div>GSTIN: {company.gstin}</div>}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-wide">DEBIT NOTE</div>
          <div className="mt-1">No. {bill.debitNoteNumber ?? "(issued when the bill is passed)"}</div>
          <div>Date: {formatDate(bill.passedAt ?? new Date())}</div>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <div className="font-semibold">To</div>
          <div className="font-bold">{bill.vendor.name}</div>
          <div className="whitespace-pre-line">{bill.vendor.address}</div>
          <div>{[bill.vendor.city, stateName(bill.vendor.stateCode), bill.vendor.pincode].filter(Boolean).join(", ")}</div>
          {bill.vendor.gstin && <div>GSTIN: {bill.vendor.gstin}</div>}
        </div>
        <div>
          <div>
            <span className="font-semibold">Your invoice:</span> {bill.invoiceNo} dated {formatDate(bill.invoiceDate)}
          </div>
          <div>
            <span className="font-semibold">Our PO:</span> {bill.po.poNumber}
          </div>
          <div>
            <span className="font-semibold">Goods receipt:</span> {bill.grn.grnNumber} dated {formatDate(bill.grn.receivedAt)}
          </div>
        </div>
      </section>

      <p className="mt-4">We have debited your account as below against the above invoice:</p>

      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="border border-black bg-gray-100 text-left">
            <th className="border border-black p-1.5">S. No.</th>
            <th className="border border-black p-1.5">Particulars</th>
            <th className="border border-black p-1.5 text-right">Taxable</th>
            <th className="border border-black p-1.5 text-right">GST</th>
            <th className="border border-black p-1.5 text-right">Amount (INR)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="align-top">
              <td className="border border-black p-1.5">{i + 1}</td>
              <td className="border border-black p-1.5">
                <div className="font-semibold">{r.description}</div>
                <div>{r.reasons.join("; ")}</div>
              </td>
              <td className="border border-black p-1.5 text-right">{formatAmount(r.taxable)}</td>
              <td className="border border-black p-1.5 text-right">
                {formatAmount(r.tax)} ({formatQty(r.gst)}%)
              </td>
              <td className="border border-black p-1.5 text-right">{formatAmount(r.debit)}</td>
            </tr>
          ))}
          {other > 0 && (
            <tr>
              <td className="border border-black p-1.5">{rows.length + 1}</td>
              <td className="border border-black p-1.5">{bill.otherDebitReason ?? "Other deduction"}</td>
              <td className="border border-black p-1.5 text-right">{formatAmount(other)}</td>
              <td className="border border-black p-1.5 text-right">—</td>
              <td className="border border-black p-1.5 text-right">{formatAmount(other)}</td>
            </tr>
          )}
          <tr className="font-bold">
            <td className="border border-black p-1.5" colSpan={4}>
              Total
            </td>
            <td className="border border-black p-1.5 text-right">{formatAmount(total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2">
        <span className="font-semibold">Amount in words:</span> {amountInWords(total)}
      </p>
      <p className="mt-2">
        Kindly issue a credit note for the above, or adjust it in your next invoice. The invoice will be paid net of this amount (₹
        {formatAmount(bill.payableAmount)}).
      </p>

      <footer className="mt-12 flex justify-between">
        <div className="text-xs text-gray-600">Generated by PurchaseDesk · {bill.billNumber}</div>
        <div className="text-right">
          <div>For {company.name}</div>
          <div className="mt-10 border-t border-black pt-1">{company.signatoryName ?? "Authorised signatory"}</div>
        </div>
      </footer>
    </div>
  );
}
