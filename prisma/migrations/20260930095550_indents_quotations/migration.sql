-- CreateEnum
CREATE TYPE "IndentStatus" AS ENUM ('DRAFT', 'OPEN', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IndentPriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "Certification" AS ENUM ('ISO_9001', 'ISO_OTHER', 'CUSTOMER', 'NONE');

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "indent_id" INTEGER,
ADD COLUMN     "quotation_id" INTEGER;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "certification" "Certification" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "indents" (
    "id" SERIAL NOT NULL,
    "indent_number" TEXT NOT NULL,
    "status" "IndentStatus" NOT NULL DEFAULT 'DRAFT',
    "department" TEXT,
    "priority" "IndentPriority" NOT NULL DEFAULT 'NORMAL',
    "required_by" DATE,
    "purpose" TEXT,
    "requested_by" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "comparison_submitted_by" INTEGER,
    "comparison_submitted_at" TIMESTAMP(3),
    "quote_justification" TEXT,
    "approved_by" INTEGER,
    "approved_at" TIMESTAMP(3),
    "approval_note" TEXT,
    "rejection_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indent_items" (
    "id" SERIAL NOT NULL,
    "indent_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "current_stock" DECIMAL(14,3),
    "remarks" TEXT,
    "selected_quote_item_id" INTEGER,
    "selection_reason" TEXT,

    CONSTRAINT "indent_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" SERIAL NOT NULL,
    "indent_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "vendor_ref" TEXT,
    "quote_date" DATE,
    "valid_until" DATE,
    "delivery_days" INTEGER,
    "payment_terms" TEXT,
    "credit_days" INTEGER NOT NULL DEFAULT 0,
    "early_discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "other_charges" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "attachment_path" TEXT,
    "attachment_name" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" SERIAL NOT NULL,
    "quotation_id" INTEGER NOT NULL,
    "indent_item_id" INTEGER NOT NULL,
    "rate" DECIMAL(15,2) NOT NULL,
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gst_rate" DECIMAL(5,2) NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "indents_indent_number_key" ON "indents"("indent_number");

-- CreateIndex
CREATE INDEX "indents_status_idx" ON "indents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "indent_items_selected_quote_item_id_key" ON "indent_items"("selected_quote_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "indent_items_indent_id_line_no_key" ON "indent_items"("indent_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_indent_id_vendor_id_key" ON "quotations"("indent_id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_items_quotation_id_indent_item_id_key" ON "quotation_items"("quotation_id", "indent_item_id");

-- CreateIndex
CREATE INDEX "purchase_orders_indent_id_idx" ON "purchase_orders"("indent_id");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "indents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indents" ADD CONSTRAINT "indents_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indents" ADD CONSTRAINT "indents_comparison_submitted_by_fkey" FOREIGN KEY ("comparison_submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indents" ADD CONSTRAINT "indents_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indent_items" ADD CONSTRAINT "indent_items_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "indents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indent_items" ADD CONSTRAINT "indent_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indent_items" ADD CONSTRAINT "indent_items_selected_quote_item_id_fkey" FOREIGN KEY ("selected_quote_item_id") REFERENCES "quotation_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "indents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_indent_item_id_fkey" FOREIGN KEY ("indent_item_id") REFERENCES "indent_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
