-- AlterTable
ALTER TABLE "items" ADD COLUMN     "current_stock" DECIMAL(14,3),
ADD COLUMN     "min_stock" DECIMAL(14,3),
ADD COLUMN     "pack_size" DECIMAL(14,3),
ADD COLUMN     "pack_unit" TEXT,
ADD COLUMN     "reorder_qty" DECIMAL(14,3),
ADD COLUMN     "stock_updated_at" TIMESTAMP(3),
ADD COLUMN     "stock_updated_by" INTEGER;

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "previous_qty" DECIMAL(14,3),
    "note" TEXT,
    "counted_by" INTEGER NOT NULL,
    "counted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_counts_item_id_counted_at_idx" ON "stock_counts"("item_id", "counted_at");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_stock_updated_by_fkey" FOREIGN KEY ("stock_updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_counted_by_fkey" FOREIGN KEY ("counted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
