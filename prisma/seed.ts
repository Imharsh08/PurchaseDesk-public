/**
 * Seeds the first admin user and, with `--demo`, sample masters and POs.
 *
 *   npx prisma db seed                 # admin only
 *   npx prisma db seed -- --demo       # admin + demo data
 *
 * Set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD to choose the admin login;
 * otherwise a random password is generated and printed once.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma-node/client";
import { calcLine, calcTotals, determineTaxMode } from "../src/lib/po-calc";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 }),
});
const demo = process.argv.includes("--demo");
const credentials: { email: string; password: string; role: string }[] = [];

async function ensureUser(email: string, name: string, role: "ADMIN" | "MANAGER" | "PURCHASER", password?: string) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;
  const pwd = password ?? randomBytes(9).toString("base64url");
  credentials.push({ email, password: pwd, role });
  return db.user.create({
    data: { email, name, roles: [role], passwordHash: await bcrypt.hash(pwd, 12), department: "Purchase" },
  });
}

const DEFAULT_TERMS = `1. Please quote our PO number on all invoices, delivery challans and correspondence.
2. Material must conform to the agreed specification; a test certificate must accompany each lot.
3. Goods are subject to inspection on receipt; rejected material will be returned at the supplier's cost.
4. Delivery must be made on or before the date stated above. Delays must be informed in advance.
5. Payment as per the terms stated above, from the date of receipt of material and a valid GST invoice.
6. Disputes are subject to local jurisdiction only.`;

async function main() {
  const admin = await ensureUser(
    process.env.SEED_ADMIN_EMAIL ?? "admin@purchasedesk.local",
    "Administrator",
    "ADMIN",
    process.env.SEED_ADMIN_PASSWORD,
  );

  if (demo) {
    const manager = await ensureUser("manager@purchasedesk.local", "Priya Sharma", "MANAGER");
    const purchaser = await ensureUser("purchaser@purchasedesk.local", "Rohit Verma", "PURCHASER");

    const company = await db.companySettings.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        name: "Demo Rubber Industries Pvt. Ltd.",
        address: "Plot 42, Sector 25, Industrial Area",
        city: "Faridabad",
        state: "Haryana",
        stateCode: "06",
        pincode: "121004",
        gstin: "06AABCD1234E1Z5",
        pan: "AABCD1234E",
        phone: "+91 129 400 0000",
        email: "purchase@demo-rubber.example",
        poPrefix: "PO",
        defaultTerms: DEFAULT_TERMS,
        signatoryTitle: "Head â€“ Purchase",
      },
    });

    const vendors = await Promise.all(
      [
        { code: "V-001", name: "Shree Polymers", city: "Faridabad", stateCode: "06", state: "Haryana", gstin: "06AAFCS5678K1Z2", contactPerson: "Anil Gupta", email: "sales@shreepolymers.example", phone: "+91 98110 00001", paymentTerms: "30 days from invoice", leadTimeDays: 7 },
        { code: "V-002", name: "Delhi Chemicals & Co.", city: "New Delhi", stateCode: "07", state: "Delhi", gstin: "07AAACD4321M1Z9", contactPerson: "Sunita Rao", email: "orders@delhichem.example", phone: "+91 98110 00002", paymentTerms: "45 days", leadTimeDays: 5 },
        { code: "V-003", name: "Gujarat Carbon Ltd.", city: "Vadodara", stateCode: "24", state: "Gujarat", gstin: "24AABCG9876P1Z1", contactPerson: "Mehul Patel", email: "dispatch@gujcarbon.example", phone: "+91 98250 00003", paymentTerms: "Advance 20%, balance 30 days", leadTimeDays: 12 },
        { code: "V-004", name: "Kerala Latex Traders", city: "Kottayam", stateCode: "32", state: "Kerala", gstin: "32AAKFK2468Q1Z7", contactPerson: "Thomas Mathew", email: "info@keralalatex.example", phone: "+91 94470 00004", paymentTerms: "15 days", leadTimeDays: 15 },
      ].map((v) => db.vendor.upsert({ where: { code: v.code }, update: {}, create: v })),
    );

    const items = await Promise.all(
      [
        { sku: "RM-NR-RSS4", name: "Natural Rubber RSS-4", category: "Raw material", uom: "Kg", hsnCode: "40012100", gstRate: 5 },
        { sku: "RM-EPDM-4551", name: "EPDM 4551A", category: "Raw material", uom: "Kg", hsnCode: "40027000", gstRate: 18 },
        { sku: "RM-CB-N330", name: "Carbon Black N330", category: "Filler", uom: "Kg", hsnCode: "28030010", gstRate: 18 },
        { sku: "RM-ZNO", name: "Zinc Oxide (99.5%)", category: "Chemical", uom: "Kg", hsnCode: "28170010", gstRate: 18 },
        { sku: "RM-STEARIC", name: "Stearic Acid", category: "Chemical", uom: "Kg", hsnCode: "38231100", gstRate: 18 },
        { sku: "RM-SULPHUR", name: "Insoluble Sulphur", category: "Chemical", uom: "Kg", hsnCode: "25030010", gstRate: 5 },
        { sku: "RM-OIL-PARA", name: "Paraffinic Process Oil", category: "Oil", uom: "Ltr", hsnCode: "27101990", gstRate: 18 },
        { sku: "PK-CARTON-L", name: "Corrugated Carton (Large)", category: "Packaging", uom: "Nos", hsnCode: "48191010", gstRate: 5 },
      ].map((i) => db.item.upsert({ where: { sku: i.sku }, update: {}, create: i })),
    );

    if ((await db.purchaseOrder.count()) === 0) {
      const makePO = async (
        vendorIndex: number,
        lines: { item: number; qty: number; rate: number }[],
        status: "DRAFT" | "PENDING_APPROVAL",
      ) => {
        const vendor = vendors[vendorIndex];
        const taxMode = determineTaxMode(company.stateCode, vendor);
        const poLines = lines.map((l, i) => {
          const item = items[l.item];
          const input = { quantity: l.qty, rate: l.rate, discountPct: 0, gstRate: Number(item.gstRate) };
          const a = calcLine(input, taxMode);
          return {
            lineNo: i + 1,
            itemId: item.id,
            description: item.name,
            hsnCode: item.hsnCode,
            uom: item.uom,
            quantity: l.qty,
            rate: l.rate,
            gstRate: input.gstRate,
            taxableAmount: a.taxable,
            taxAmount: a.tax,
            lineTotal: a.total,
          };
        });
        const t = calcTotals(poLines.map((l) => ({ quantity: l.quantity, rate: l.rate, discountPct: 0, gstRate: l.gstRate })), taxMode);
        return db.purchaseOrder.create({
          data: {
            vendorId: vendor.id,
            status,
            taxMode,
            paymentTerms: vendor.paymentTerms,
            terms: DEFAULT_TERMS,
            expectedDeliveryDate: new Date(Date.now() + (vendor.leadTimeDays ?? 7) * 86_400_000),
            subtotal: t.subtotal,
            cgstAmount: t.cgst,
            sgstAmount: t.sgst,
            igstAmount: t.igst,
            roundOff: t.roundOff,
            grandTotal: t.grandTotal,
            createdById: purchaser.id,
            submittedAt: status === "PENDING_APPROVAL" ? new Date() : null,
            items: { create: poLines },
          },
        });
      };

      await makePO(2, [{ item: 2, qty: 2500, rate: 92.5 }, { item: 3, qty: 400, rate: 238 }], "PENDING_APPROVAL");
      await makePO(0, [{ item: 1, qty: 1200, rate: 265 }, { item: 4, qty: 150, rate: 118.75 }], "PENDING_APPROVAL");
      await makePO(3, [{ item: 0, qty: 5000, rate: 182.4 }], "DRAFT");
    }

    console.log(`Demo data ready (manager: ${manager.email}, purchaser: ${purchaser.email}).`);
  }

  console.log(`Admin: ${admin.email}`);
  if (credentials.length) {
    console.log("\nNew logins (shown once, change them after first sign-in):");
    console.table(credentials);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
