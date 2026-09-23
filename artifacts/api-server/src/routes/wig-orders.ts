import express, { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, wigOrdersTable, wigReceiptsTable } from "@workspace/db";
import {
  CreateWigOrderBody, UpdateWigOrderBody, ConfirmWigOrderImportBody,
  ListWigOrdersResponse, ListWigReceiptsResponse, IssueWigReceiptResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";
import { calculateAmounts, normalizeOrder } from "../lib/wig-orders";
import { previewWorkbook } from "../lib/wig-import";
import { sendReceiptPdf } from "../lib/wig-receipt-pdf";

const router: IRouter = Router();
router.use("/admin/orders", requireAdmin);

function validDay(day: string) {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

function idParam(raw: string | string[] | undefined) {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function orderResponse(order: typeof wigOrdersTable.$inferSelect) {
  return { ...order, createdAt: order.createdAt.toISOString() };
}

function receiptResponse(receipt: typeof wigReceiptsTable.$inferSelect) {
  return {
    id: receipt.id, orderId: receipt.orderId,
    issuedAt: receipt.issuedAt.toISOString(), receiptNumber: `RW-${receipt.id}`,
  };
}

function parseOrder(body: unknown) {
  const parsed = CreateWigOrderBody.safeParse(body);
  if (!parsed.success) return { ok: false, error: "Check the required order fields and their lengths" } as const;
  const data = parsed.data;
  if (!validDay(data.orderDate)) return { ok: false, error: "Enter a valid order date" } as const;
  if (!data.itemCode.trim() || !data.customerName.trim()) {
    return { ok: false, error: "Item code and customer name are required" } as const;
  }
  try {
    return { ok: true, value: normalizeOrder(data) } as const;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid order amounts" } as const;
  }
}

router.get("/admin/orders", async (_req, res): Promise<void> => {
  const orders = await db.select().from(wigOrdersTable).orderBy(desc(wigOrdersTable.orderDate), desc(wigOrdersTable.id));
  res.json(ListWigOrdersResponse.parse(orders.map(orderResponse)));
});

router.post("/admin/orders", async (req, res): Promise<void> => {
  const parsed = parseOrder(req.body);
  if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
  const [created] = await db.insert(wigOrdersTable).values(parsed.value).onConflictDoNothing().returning();
  if (!created) { res.status(409).json({ error: "This item code already exists for that order type" }); return; }
  res.status(201).json(orderResponse(created));
});

router.patch("/admin/orders/:id", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid order ID" }); return; }
  const parsed = UpdateWigOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Check the required order fields" }); return; }
  const order = parseOrder(parsed.data);
  if (!order.ok) { res.status(400).json({ error: order.error }); return; }
  let updated: typeof wigOrdersTable.$inferSelect | undefined;
  try {
    [updated] = await db.update(wigOrdersTable).set(order.value)
      .where(eq(wigOrdersTable.id, id)).returning();
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "This item code already exists for that order type" }); return;
    }
    throw error;
  }
  if (!updated) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(orderResponse(updated));
});

router.get("/admin/orders/:id/receipts", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid order ID" }); return; }
  const [order] = await db.select({ id: wigOrdersTable.id }).from(wigOrdersTable).where(eq(wigOrdersTable.id, id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const receipts = await db.select().from(wigReceiptsTable).where(eq(wigReceiptsTable.orderId, id)).orderBy(desc(wigReceiptsTable.id));
  res.json(ListWigReceiptsResponse.parse(receipts.map(receiptResponse)));
});

router.post("/admin/orders/:id/receipts", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid order ID" }); return; }
  const [order] = await db.select().from(wigOrdersTable).where(eq(wigOrdersTable.id, id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const [receipt] = await db.insert(wigReceiptsTable).values({ orderId: id, snapshot: order }).returning();
  res.status(201).json(IssueWigReceiptResponse.parse(receiptResponse(receipt)));
});

router.get("/admin/orders/:id/receipts/:receiptId/pdf", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const receiptId = idParam(req.params.receiptId);
  if (!id || !receiptId) { res.status(400).json({ error: "Invalid receipt ID" }); return; }
  const [receipt] = await db.select().from(wigReceiptsTable).where(eq(wigReceiptsTable.id, receiptId));
  if (!receipt || receipt.orderId !== id) { res.status(404).json({ error: "Receipt not found" }); return; }
  sendReceiptPdf(res, receipt);
});

router.post("/admin/orders/import/preview",
  express.raw({ type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", limit: "3mb" }),
  async (req, res): Promise<void> => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Choose an .xlsx workbook" }); return;
    }
    const existing = await db.select({ kind: wigOrdersTable.kind, code: wigOrdersTable.itemCode }).from(wigOrdersTable);
    const keys = new Set(existing.map(row => `${row.kind}:${row.code.toLowerCase()}`));
    try {
      res.json(await previewWorkbook(req.body, keys));
    } catch (error) {
      req.log.warn({ error }, "Could not preview wig order workbook");
      res.status(400).json({ error: error instanceof Error && error.message.startsWith("Workbook has more than 500 valid orders")
        ? error.message : "Could not read the workbook. Choose an Orders.xlsx workbook." });
    }
  });

router.post("/admin/orders/import/confirm", express.json({ limit: "2mb" }), async (req, res): Promise<void> => {
  const parsed = ConfirmWigOrderImportBody.safeParse(req.body);
  if (!parsed.success || parsed.data.rows.length > 500) {
    res.status(400).json({ error: "Invalid import selection" }); return;
  }
  const skipped: { sheet: string; rowNumber: number; reason: string }[] = [];
  const accepted: { sheet: string; rowNumber: number; value: ReturnType<typeof normalizeOrder> }[] = [];
  const seen = new Set<string>();
  for (const row of parsed.data.rows) {
    const order = parseOrder(row.order);
    const kind = row.sheet === "Stock Wigs" ? "stock" : row.sheet === "Custom Wigs" ? "custom" : null;
    const key = order.ok ? `${kind}:${order.value.itemCode.toLowerCase()}` : "";
    if (!kind || !order.ok || order.value.kind !== kind || seen.has(key)) {
      skipped.push({ sheet: row.sheet, rowNumber: row.rowNumber, reason: "Invalid or duplicate row" });
      continue;
    }
    seen.add(key);
    accepted.push({ sheet: row.sheet, rowNumber: row.rowNumber, value: order.value });
  }
  let imported = 0;
  await db.transaction(async tx => {
    for (const row of accepted) {
      const [created] = await tx.insert(wigOrdersTable).values(row.value).onConflictDoNothing().returning({ id: wigOrdersTable.id });
      if (created) imported++;
      else skipped.push({ sheet: row.sheet, rowNumber: row.rowNumber, reason: "Item code already exists" });
    }
  });
  res.json({ imported, skipped });
});

export default router;