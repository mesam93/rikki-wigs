import { currentGoogleIdentity } from "../auth/google-policy";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, asc, desc, eq, gt, gte, inArray, or, sql } from "drizzle-orm";
import { appointmentsTable, clientsTable, db, wigReceiptsTable } from "@workspace/db";
import { GetClientHistoryResponse, ViewClientReceiptParams, DownloadClientReceiptParams } from "@workspace/api-zod";
import { normalizedEmail, validClientEmail } from "../lib/client-identity";
import { sendReceiptPdf } from "../lib/wig-receipt-pdf";

const router: IRouter = Router();

// Never accept an email from a query or body here.
// Ownership requires the server's Google-verified email, never a form-supplied address.
async function verifiedClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = currentGoogleIdentity(req.session?.googleUser);
  if (!user) { res.status(401).json({ error: "Sign in required" }); return; }
  const email = validClientEmail(user.email);
  if (!email) { res.status(403).json({ error: "Verify your email to access your account" }); return; }
  res.locals.clientEmail = email;
  next();
}

function receiptEmailMatches(email: string) {
  // Ownership is fixed when a receipt is issued. A later edit to the order
  // must never make a previously email-less receipt visible to someone else.
  return sql`lower(btrim(${wigReceiptsTable.snapshot}->>'email')) = ${email}`;
}

router.get("/client/history", verifiedClient, async (_req, res): Promise<void> => {
  const email = res.locals.clientEmail as string;
  // A verified sign-up can precede an order. Claim that identity once, without
  // granting access to other records; matching is always derived from email.
  await db.insert(clientsTable).values({ email }).onConflictDoNothing();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const today = `${value("year")}-${value("month")}-${value("day")}`;
  const currentTime = `${value("hour")}:${value("minute")}`;
  const [appointments, receipts] = await Promise.all([
    db.select({
      id: appointmentsTable.id,
      service: appointmentsTable.service,
      appointmentDate: appointmentsTable.appointmentDate,
      appointmentTime: appointmentsTable.appointmentTime,
      status: appointmentsTable.status,
    }).from(appointmentsTable).where(and(
      sql`lower(btrim(${appointmentsTable.email})) = ${email}`,
      or(
        gt(appointmentsTable.appointmentDate, today),
        and(eq(appointmentsTable.appointmentDate, today), gte(appointmentsTable.appointmentTime, currentTime)),
      ),
      inArray(appointmentsTable.status, ["pending", "confirmed"]),
    )).orderBy(asc(appointmentsTable.appointmentDate), asc(appointmentsTable.appointmentTime)),
    db.select().from(wigReceiptsTable).where(receiptEmailMatches(email))
      .orderBy(desc(wigReceiptsTable.issuedAt), desc(wigReceiptsTable.id)),
  ]);
  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetClientHistoryResponse.parse({
    email,
    appointments,
    receipts: receipts.map((receipt) => ({
      id: receipt.id, orderId: receipt.orderId,
      receiptNumber: `RW-${receipt.id}`,
      issuedAt: receipt.issuedAt.toISOString(),
      customerName: receipt.snapshot.customerName,
      itemCode: receipt.snapshot.itemCode,
    })),
  }));
});

async function serveClientReceipt(req: Request, res: Response, inline: boolean): Promise<void> {
  const params = (inline ? ViewClientReceiptParams : DownloadClientReceiptParams).safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid receipt ID" }); return; }
  const email = normalizedEmail(res.locals.clientEmail as string);
  const [receipt] = await db.select().from(wigReceiptsTable)
    .where(and(eq(wigReceiptsTable.id, params.data.id), receiptEmailMatches(email)));
  if (!receipt) { res.status(404).json({ error: "Receipt not found" }); return; }
  res.setHeader("Cache-Control", "private, no-store");
  sendReceiptPdf(res, receipt, inline);
}

router.get("/client/receipts/:id/view", verifiedClient, async (req, res): Promise<void> => {
  await serveClientReceipt(req, res, true);
});
router.get("/client/receipts/:id/pdf", verifiedClient, async (req, res): Promise<void> => {
  await serveClientReceipt(req, res, false);
});

export default router;