import { boolean, date, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const wigKindEnum = pgEnum("wig_order_kind", ["stock", "custom"]);

export const wigOrdersTable = pgTable("wig_orders", {
  id: serial("id").primaryKey(),
  kind: wigKindEnum("kind").notNull(),
  itemCode: text("item_code"),
  orderDate: date("order_date", { mode: "string" }),
  customerName: text("customer_name"),
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
  priceCents: integer("price_cents"),
  taxRateMilliPercent: integer("tax_rate_milli_percent").notNull().default(6625),
  amountPaidCents: integer("amount_paid_cents"),
  taxCents: integer("tax_cents"),
  totalCents: integer("total_cents"),
  amountDueCents: integer("amount_due_cents"),
  needsReview: boolean("needs_review").notNull().default(false),
  reviewIssues: jsonb("review_issues").$type<string[]>().notNull().default([]),
  sourceSheet: text("source_sheet"),
  sourceRowNumber: integer("source_row_number"),
  sourceValues: jsonb("source_values").$type<Record<string, string>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("wig_orders_kind_item_code_unique").on(table.kind, table.itemCode),
  uniqueIndex("wig_orders_source_unique").on(table.sourceSheet, table.sourceRowNumber),
]);

export const wigReceiptsTable = pgTable("wig_receipts", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => wigOrdersTable.id),
  snapshot: jsonb("snapshot").$type<typeof wigOrdersTable.$inferSelect>().notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWigOrderSchema = createInsertSchema(wigOrdersTable).omit({
  id: true, taxCents: true, totalCents: true, amountDueCents: true, createdAt: true,
  needsReview: true, reviewIssues: true, sourceSheet: true, sourceRowNumber: true, sourceValues: true,
});
export type WigOrder = typeof wigOrdersTable.$inferSelect;
export type WigReceipt = typeof wigReceiptsTable.$inferSelect;
export type InsertWigOrder = z.infer<typeof insertWigOrderSchema>;