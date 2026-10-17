-- CreateEnum
CREATE TYPE "GrnStatus" AS ENUM ('PENDING_QC', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CheckResult" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('SHORT_QTY', 'EXCESS_QTY', 'QUALITY', 'DAMAGED', 'WRONG_ITEM', 'LATE_DELIVERY', 'DOCUMENTS', 'RATE_MISMATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "StockEntryKind" AS ENUM ('COUNT', 'RECEIPT');

-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('MANUAL', 'QUOTATION', 'PO');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "grn_id" INTEGER;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "short_close_reason" TEXT,
ADD COLUMN     "short_closed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "stock_counts" ADD COLUMN     "grn_id" INTEGER,
ADD COLUMN     "kind" "StockEntryKind" NOT NULL DEFAULT 'COUNT';

-- CreateTable
CREATE TABLE "vendor_items" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "vendor_item_code" TEXT,
    "rate" DECIMAL(15,2),
    "rate_source" "RateSource" NOT NULL DEFAULT 'MANUAL',
    "rate_date" DATE,
    "lead_time_days" INTEGER,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" SERIAL NOT NULL,
    "grn_number" TEXT NOT NULL,
    "status" "GrnStatus" NOT NULL DEFAULT 'PENDING_QC',
    "po_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "received_at" DATE NOT NULL,
    "invoice_no" TEXT,
    "invoice_date" DATE,
    "invoice_amount" DECIMAL(15,2),
    "challan_no" TEXT,
    "transporter" TEXT,
    "bilty_no" TEXT,
    "bilty_date" DATE,
    "vehicle_no" TEXT,
    "freight_amount" DECIMAL(15,2),
    "remarks" TEXT,
    "received_by" INTEGER NOT NULL,
    "qc_by" INTEGER,
    "qc_at" TIMESTAMP(3),
    "qc_remarks" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_items" (
    "id" SERIAL NOT NULL,
    "grn_id" INTEGER NOT NULL,
    "po_item_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "invoice_qty" DECIMAL(14,3),
    "received_qty" DECIMAL(14,3) NOT NULL,
    "qty_check" "CheckResult",
    "quality_check" "CheckResult",
    "accepted_qty" DECIMAL(14,3),
    "rejected_qty" DECIMAL(14,3),
    "remarks" TEXT,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_issues" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "po_id" INTEGER,
    "grn_id" INTEGER,
    "item_id" INTEGER,
    "type" "IssueType" NOT NULL,
    "description" TEXT NOT NULL,
    "qty_affected" DECIMAL(14,3),
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "raised_by" INTEGER NOT NULL,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by" INTEGER,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "vendor_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_items_item_id_idx" ON "vendor_items"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_items_vendor_id_item_id_key" ON "vendor_items"("vendor_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_grn_number_key" ON "goods_receipts"("grn_number");

-- CreateIndex
CREATE INDEX "goods_receipts_po_id_idx" ON "goods_receipts"("po_id");

-- CreateIndex
CREATE INDEX "goods_receipts_vendor_id_received_at_idx" ON "goods_receipts"("vendor_id", "received_at");

-- CreateIndex
CREATE INDEX "goods_receipts_status_idx" ON "goods_receipts"("status");

-- CreateIndex
CREATE INDEX "goods_receipt_items_grn_id_idx" ON "goods_receipt_items"("grn_id");

-- CreateIndex
CREATE INDEX "goods_receipt_items_po_item_id_idx" ON "goods_receipt_items"("po_item_id");

-- CreateIndex
CREATE INDEX "goods_receipt_items_item_id_idx" ON "goods_receipt_items"("item_id");

-- CreateIndex
CREATE INDEX "vendor_issues_vendor_id_status_idx" ON "vendor_issues"("vendor_id", "status");

-- CreateIndex
CREATE INDEX "vendor_issues_grn_id_idx" ON "vendor_issues"("grn_id");

-- CreateIndex
CREATE INDEX "vendor_issues_po_id_idx" ON "vendor_issues"("po_id");

-- CreateIndex
CREATE INDEX "documents_grn_id_idx" ON "documents"("grn_id");

-- AddForeignKey
ALTER TABLE "vendor_items" ADD CONSTRAINT "vendor_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_items" ADD CONSTRAINT "vendor_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_qc_by_fkey" FOREIGN KEY ("qc_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_po_item_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "po_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_issues" ADD CONSTRAINT "vendor_issues_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_issues" ADD CONSTRAINT "vendor_issues_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_issues" ADD CONSTRAINT "vendor_issues_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_issues" ADD CONSTRAINT "vendor_issues_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_issues" ADD CONSTRAINT "vendor_issues_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_issues" ADD CONSTRAINT "vendor_issues_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: link each vendor to the items it has quoted or been ordered, at its latest net rate
INSERT INTO "vendor_items" ("vendor_id", "item_id", "rate", "rate_source", "rate_date", "updated_at")
SELECT DISTINCT ON (vendor_id, item_id) vendor_id, item_id, rate, source::"RateSource", rate_date, CURRENT_TIMESTAMP
FROM (
  SELECT po."vendor_id", pi."item_id", round(pi."rate" * (1 - pi."discount_pct" / 100), 2) AS rate, 'PO' AS source,
         po."po_date"::date AS rate_date, 1 AS pri
  FROM "po_items" pi JOIN "purchase_orders" po ON po."id" = pi."po_id"
  WHERE po."po_number" IS NOT NULL AND po."status" <> 'CANCELLED'
  UNION ALL
  SELECT q."vendor_id", ii."item_id", round(qi."rate" * (1 - qi."discount_pct" / 100), 2), 'QUOTATION',
         coalesce(q."quote_date", q."created_at"::date), 2
  FROM "quotation_items" qi
  JOIN "quotations" q ON q."id" = qi."quotation_id"
  JOIN "indent_items" ii ON ii."id" = qi."indent_item_id"
) s
ORDER BY vendor_id, item_id, rate_date DESC NULLS LAST, pri;