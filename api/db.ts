/**
 * The API's database client. Shared business code imports `db` from "@/lib/db"; the API build
 * points that import here (see build.mjs), so the same code runs on Neon Functions.
 * One pool per isolate, shared by every request it serves; Neon reclaims it on eviction.
 */
import { attachDatabasePool } from "@neon/functions";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma-node/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

export const db = new PrismaClient({ adapter: new PrismaPg(pool) });
