import { date, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const wigKindEnum = pgEnum("wig_order_kind", ["stock", "custom"]);

export const wigOrdersTable = pgTable("wig_orders", {
  id: serial("id").primaryKey(),
  kind: wigKindEnum("kind").notNull(),
  itemCode: text("item_code").notNull(),
  orderDate: date("order_date", { mode: "string" }).notNull(),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  notes: text("notes").notNull().default(""),
  style: text("style").notNull().default(""),
  capSize: text("cap_size").notNull().default(""),
  lengthInch: text("length_inch").notNull().default(""),
  hairType: text("hair_type").notNull().default(""),
  part: text("part").notNull().default(""),
  layers: text("layers").notNull().default(""),
  density: text("density").notNull().default(""),
  color: text("color").notNull().default(""),
  highlights: text("highlights").notNull().default(""),
  priceCents: integer("price_cents").notNull(),
  taxRateMilliPercent: integer("tax_rate_milli_percent").notNull().default(6625),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  amountDueCents: integer("amount_due_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("wig_orders_kind_item_code_unique").on(table.kind, table.itemCode)]);

export const wigReceiptsTable = pgTable("wig_receipts", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => wigOrdersTable.id),
  snapshot: jsonb("snapshot").$type<typeof wigOrdersTable.$inferSelect>().notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWigOrderSchema = createInsertSchema(wigOrdersTable).omit({
  id: true, taxCents: true, totalCents: true, amountDueCents: true, createdAt: true,
});
export type WigOrder = typeof wigOrdersTable.$inferSelect;
export type WigReceipt = typeof wigReceiptsTable.$inferSelect;
export type InsertWigOrder = z.infer<typeof insertWigOrderSchema>;