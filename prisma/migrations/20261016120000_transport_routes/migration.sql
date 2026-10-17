-- Inward transport (Settings → Transport): which transporters bring material from each vendor city to
-- our shipping address; the transporter a vendor sends with (empty = its city's first one); and how an
-- item always comes whatever the vendor (e.g. small parcels by courier).
ALTER TABLE "company_settings" ADD COLUMN "transport" JSONB;
ALTER TABLE "vendors" ADD COLUMN "preferred_transport" TEXT;
ALTER TABLE "items" ADD COLUMN "preferred_transport" TEXT;
