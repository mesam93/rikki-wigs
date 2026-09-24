import { createHash, timingSafeEqual } from "node:crypto";
import { Router, raw, type IRouter, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db, wigOrdersTable, wigReceiptsTable } from "@workspace/db";
import {
  CreateWigOrderBody, UpdateWigOrderBody,
  ListWigOrdersResponse, ListWigReceiptsResponse, IssueWigReceiptResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";
import { normalizeOrder } from "../lib/wig-orders";
import { parseHistoricalWorkbook } from "../lib/wig-import";
import { applyHistoricalImport, inspectHistoricalImport } from "../lib/wig-import-run";
import { sendReceiptPdf } from "../lib/wig-receipt-pdf";
import { ensureClient, validClientEmail } from "../lib/client-identity";

const router: IRouter = Router();
router.use("/admin/orders", requireAdmin);

const historicalWorkbookHash = "ee0c0d25fc52e7748b9022ef91dc68c20d9986f730671980c8cb297da1d1b09f";
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

function parseOrder(body: unknown, tariffCents: number) {
  const parsed = CreateWigOrderBody.safeParse(body);
  if (!parsed.success) return { ok: false, error: "Check the required order fields and their lengths" } as const;
  const data = parsed.data;
  if (!validDay(data.orderDate)) return { ok: false, error: "Enter a valid order date" } as const;
  if (!data.itemCode.trim() || !data.customerName.trim()) {
    return { ok: false, error: "Item code and customer name are required" } as const;
  }
  if (data.email?.trim() && !validClientEmail(data.email)) {
    return { ok: false, error: "Enter a valid customer email address" } as const;
  }
  try {
    return { ok: true, value: normalizeOrder({ ...data, email: data.email ? validClientEmail(data.email) ?? "" : "", tariffCents }) } as const;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid order amounts" } as const;
  }
}

router.get("/admin/orders", async (_req, res): Promise<void> => {
  const orders = await db.select().from(wigOrdersTable).orderBy(desc(wigOrdersTable.orderDate), desc(wigOrdersTable.id));
  res.json(ListWigOrdersResponse.parse(orders.map(orderResponse)));
});

router.post("/admin/orders/historical-import", raw({ type: "application/octet-stream", limit: "1mb" }),
  async (req, res): Promise<void> => {
    const expectedHash = Buffer.from(historicalWorkbookHash, "hex");
    if (!Buffer.isBuffer(req.body) ||
        !timingSafeEqual(createHash("sha256").update(req.body).digest(), expectedHash)) {
      res.status(400).json({ error: "The uploaded workbook does not match the authorized historical source" });
      return;
    }
    const orders = await parseHistoricalWorkbook(req.body);
    if (req.query.apply !== "true") {
      res.json(await inspectHistoricalImport(orders));
      return;
    }
    if (req.get("x-confirm-historical-import") !== "184-source-rows") {
      res.status(400).json({ error: "Explicit import confirmation is required" });
      return;
    }
    try {
      res.json(await applyHistoricalImport(orders));
    } catch (error) {
      if (error instanceof Error && /Import stopped for review|Source row reconciliation failed|Could not save/.test(error.message)) {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

router.post("/admin/orders", async (req, res): Promise<void> => {
  const parsed = parseOrder(req.body, 2_500);
  if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
  const created = await db.transaction(async (tx) => {
    const [order] = await tx.insert(wigOrdersTable).values(parsed.value).onConflictDoNothing().returning();
    if (!order) return null;
    await tx.insert(wigReceiptsTable).values({ orderId: order.id, snapshot: order });
    await ensureClient(tx, order.email);
    return order;
  });
  if (!created) { res.status(409).json({ error: "This item code already exists for that order type" }); return; }
  res.status(201).json(orderResponse(created));
});

router.patch("/admin/orders/:id", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid order ID" }); return; }
  const parsed = UpdateWigOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Check the required order fields" }); return; }
  const [current] = await db.select({ tariffCents: wigOrdersTable.tariffCents })
    .from(wigOrdersTable).where(eq(wigOrdersTable.id, id));
  if (!current) { res.status(404).json({ error: "Order not found" }); return; }
  const order = parseOrder(parsed.data, current.tariffCents);
  if (!order.ok) { res.status(400).json({ error: order.error }); return; }
  let updated: typeof wigOrdersTable.$inferSelect | undefined;
  try {
    updated = await db.transaction(async (tx) => {
      const [saved] = await tx.update(wigOrdersTable).set({ ...order.value, needsReview: false, reviewIssues: [] })
        .where(eq(wigOrdersTable.id, id)).returning();
      if (saved) await ensureClient(tx, saved.email);
      return saved;
    });
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
  const [order] = await db.select().from(wigOrdersTable).where(eq(wigOrdersTable.id, id));
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
