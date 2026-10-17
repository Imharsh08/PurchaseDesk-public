-- Unit conversions per item: 1 unit = factor × the item's own unit.
CREATE TABLE "item_units" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "factor" DECIMAL(20,10) NOT NULL,

    CONSTRAINT "item_units_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "item_units_item_id_unit_key" ON "item_units"("item_id", "unit");

ALTER TABLE "item_units" ADD CONSTRAINT "item_units_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
