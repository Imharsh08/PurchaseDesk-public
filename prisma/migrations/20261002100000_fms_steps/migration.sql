-- AlterTable
ALTER TABLE "goods_receipts" ADD COLUMN     "return_note" TEXT,
ADD COLUMN     "returned_at" TIMESTAMP(3),
ADD COLUMN     "returned_by" INTEGER,
ADD COLUMN     "stored_at" TIMESTAMP(3),
ADD COLUMN     "stored_by" INTEGER,
ADD COLUMN     "tally_ref" TEXT;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "acknowledged_at" TIMESTAMP(3),
ADD COLUMN     "dispatch_bilty_no" TEXT,
ADD COLUMN     "dispatch_note" TEXT,
ADD COLUMN     "dispatch_transporter" TEXT,
ADD COLUMN     "dispatched_at" TIMESTAMP(3),
ADD COLUMN     "expected_dispatch_date" DATE,
ADD COLUMN     "follow_up_at" TIMESTAMP(3),
ADD COLUMN     "follow_up_note" TEXT;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_returned_by_fkey" FOREIGN KEY ("returned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_stored_by_fkey" FOREIGN KEY ("stored_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
