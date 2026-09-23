import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db, wigOrdersTable, wigReceiptsTable } from "@workspace/db";
import {
  CreateWigOrderBody, UpdateWigOrderBody,
  ListWigOrdersResponse, ListWigReceiptsResponse, IssueWigReceiptResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";
import { normalizeOrder } from "../lib/wig-orders";
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
    customerName: receipt.snapshot.customerName, itemCode: receipt.snapshot.itemCode,
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
    [updated] = await db.update(wigOrdersTable).set({ ...order.value, needsReview: false, reviewIssues: [] })
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
  if (order.needsReview || !order.itemCode || !order.customerName || !order.orderDate ||
      order.priceCents === null || order.amountPaidCents === null || order.totalCents === null) {
    res.status(409).json({ error: "Complete and save this order before issuing a receipt" }); return;
  }
  const [receipt] = await db.insert(wigReceiptsTable).values({ orderId: id, snapshot: order }).returning();
  res.status(201).json(IssueWigReceiptResponse.parse(receiptResponse(receipt)));
});

async function serveReceiptPdf(req: Request, res: Response, inline: boolean): Promise<void> {
  const id = idParam(req.params.id);
  const receiptId = idParam(req.params.receiptId);
  if (!id || !receiptId) { res.status(400).json({ error: "Invalid receipt ID" }); return; }
  const [receipt] = await db.select().from(wigReceiptsTable).where(eq(wigReceiptsTable.id, receiptId));
  if (!receipt || receipt.orderId !== id) { res.status(404).json({ error: "Receipt not found" }); return; }
  sendReceiptPdf(res, receipt, inline);
}

router.get("/admin/orders/:id/receipts/:receiptId/pdf", async (req, res): Promise<void> => {
  await serveReceiptPdf(req, res, false);
});

router.get("/admin/orders/:id/receipts/:receiptId/view", async (req, res): Promise<void> => {
  await serveReceiptPdf(req, res, true);
});

export default router;