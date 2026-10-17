-- CreateEnum
CREATE TYPE "AmendmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('ENTERED', 'HOLD', 'PASSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTLY_PAID', 'PAID');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ACCOUNTS';

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "tat" JSONB,
ADD COLUMN     "tat_count_sundays" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "indents" ADD COLUMN     "comparison_value" DECIMAL(15,2);

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "credit_days" INTEGER,
ADD COLUMN     "revised_at" TIMESTAMP(3),
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "approval_limit" DECIMAL(15,2);

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "credit_days" INTEGER,
ADD COLUMN     "msme" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "msme_category" TEXT,
ADD COLUMN     "msme_number" TEXT;

-- CreateTable
CREATE TABLE "po_amendments" (
    "id" SERIAL NOT NULL,
    "po_id" INTEGER NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "status" "AmendmentStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "old_total" DECIMAL(15,2) NOT NULL,
    "new_total" DECIMAL(15,2) NOT NULL,
    "requested_by" INTEGER NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" INTEGER,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,

    CONSTRAINT "po_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" SERIAL NOT NULL,
    "bill_number" TEXT NOT NULL,
    "grn_id" INTEGER NOT NULL,
    "po_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "taxable_amount" DECIMAL(15,2) NOT NULL,
    "tax_amount" DECIMAL(15,2) NOT NULL,
    "other_charges" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL,
    "expected_amount" DECIMAL(15,2) NOT NULL,
    "debit_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "other_debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "other_debit_reason" TEXT,
    "debit_note_number" TEXT,
    "payable_amount" DECIMAL(15,2) NOT NULL,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit_days" INTEGER NOT NULL DEFAULT 0,
    "due_date" DATE NOT NULL,
    "msme" BOOLEAN NOT NULL DEFAULT false,
    "status" "BillStatus" NOT NULL DEFAULT 'ENTERED',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "hold_reason" TEXT,
    "remarks" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passed_by" INTEGER,
    "passed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_lines" (
    "id" SERIAL NOT NULL,
    "bill_id" INTEGER NOT NULL,
    "grn_item_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "accepted_qty" DECIMAL(14,3) NOT NULL,
    "po_rate" DECIMAL(15,2) NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL,
    "billed_qty" DECIMAL(14,3) NOT NULL,
    "billed_rate" DECIMAL(15,2) NOT NULL,
    "debit_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,

    CONSTRAINT "bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "bill_id" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "paid_on" DATE NOT NULL,
    "mode" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "po_amendments_status_idx" ON "po_amendments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "po_amendments_po_id_revision_no_key" ON "po_amendments"("po_id", "revision_no");

-- CreateIndex
CREATE UNIQUE INDEX "bills_bill_number_key" ON "bills"("bill_number");

-- CreateIndex
CREATE UNIQUE INDEX "bills_grn_id_key" ON "bills"("grn_id");

-- CreateIndex
CREATE UNIQUE INDEX "bills_debit_note_number_key" ON "bills"("debit_note_number");

-- CreateIndex
CREATE INDEX "bills_vendor_id_idx" ON "bills"("vendor_id");

-- CreateIndex
CREATE INDEX "bills_status_payment_status_due_date_idx" ON "bills"("status", "payment_status", "due_date");

-- CreateIndex
CREATE INDEX "bill_lines_bill_id_idx" ON "bill_lines"("bill_id");

-- CreateIndex
CREATE INDEX "payments_bill_id_idx" ON "payments"("bill_id");

-- AddForeignKey
ALTER TABLE "po_amendments" ADD CONSTRAINT "po_amendments_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_amendments" ADD CONSTRAINT "po_amendments_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_amendments" ADD CONSTRAINT "po_amendments_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_passed_by_fkey" FOREIGN KEY ("passed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_grn_item_id_fkey" FOREIGN KEY ("grn_item_id") REFERENCES "goods_receipt_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: credit days on POs from their approved quotation
UPDATE "purchase_orders" po SET "credit_days" = q."credit_days"
FROM "quotations" q WHERE q."id" = po."quotation_id" AND po."credit_days" IS NULL;

-- Backfill: selection value of comparisons already submitted (qty × net rate + GST, plus other charges)
UPDATE "indents" i SET "comparison_value" = v.total
FROM (
  SELECT ii."indent_id",
         round(sum(ii."quantity" * qi."rate" * (1 - qi."discount_pct" / 100) * (1 + qi."gst_rate" / 100)), 2)
         + coalesce((SELECT sum(q2."other_charges") FROM "quotations" q2
                     WHERE q2."indent_id" = ii."indent_id"
                       AND q2."id" IN (SELECT qi2."quotation_id" FROM "quotation_items" qi2
                                       JOIN "indent_items" ii2 ON ii2."selected_quote_item_id" = qi2."id"
                                       WHERE ii2."indent_id" = ii."indent_id")), 0) AS total
  FROM "indent_items" ii JOIN "quotation_items" qi ON qi."id" = ii."selected_quote_item_id"
  GROUP BY ii."indent_id"
) v
WHERE v."indent_id" = i."id";