-- Users can hold several roles: move the single role into a roles array.
ALTER TABLE "users" ADD COLUMN "roles" "Role"[] NOT NULL DEFAULT ARRAY['PURCHASER']::"Role"[];
UPDATE "users" SET "roles" = ARRAY["role"];
ALTER TABLE "users" DROP COLUMN "role";
