-- Freight on a quotation: included in the rates, or extra (amount in other_charges, or at actuals).
ALTER TABLE "quotations" ADD COLUMN "freight_terms" TEXT;

-- Quotes that already carry freight / other charges are "extra"; the rest stay "not stated".
UPDATE "quotations" SET "freight_terms" = 'EXTRA' WHERE "other_charges" > 0;
