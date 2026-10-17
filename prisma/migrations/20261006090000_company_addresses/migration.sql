-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "billing_address" TEXT;

-- CreateTable
CREATE TABLE "company_addresses" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "default_billing" BOOLEAN NOT NULL DEFAULT false,
    "default_shipping" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_addresses_active_idx" ON "company_addresses"("active");

-- The existing "Billing details" text becomes the first address, used for billing and shipping.
INSERT INTO "company_addresses" ("label", "details", "default_billing", "default_shipping", "updated_at")
SELECT 'Head office', TRIM("billing_details"), true, true, CURRENT_TIMESTAMP
FROM "company_settings"
WHERE "id" = 1 AND COALESCE(TRIM("billing_details"), '') <> '';
