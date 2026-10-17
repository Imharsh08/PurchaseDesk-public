-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "billing_details" TEXT,
ADD COLUMN     "logo2_path" TEXT,
ADD COLUMN     "po_number_style" TEXT NOT NULL DEFAULT 'YEAR_CONTINUOUS',
ADD COLUMN     "signatory_email" TEXT,
ADD COLUMN     "signatory_name" TEXT,
ADD COLUMN     "signatory_phone" TEXT;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "quotation_date" DATE;
