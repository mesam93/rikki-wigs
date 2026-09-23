import assert from "node:assert/strict";
import { test } from "node:test";
import { PassThrough } from "node:stream";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Response } from "express";
import type { WigOrder } from "@workspace/db";
import { sendReceiptPdf } from "./wig-receipt-pdf";

function render(inline: boolean, changes: Partial<WigOrder> = {}) {
  const headers = new Map<string, string>();
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on("data", chunk => chunks.push(chunk));
  const done = new Promise<Buffer>(resolve => stream.on("end", () => resolve(Buffer.concat(chunks))));
  const response = Object.assign(stream, {
    setHeader(name: string, value: string) { headers.set(name, value); return this; },
  }) as unknown as Response;
  const snapshot = {
    kind: "stock", customerName: "Jane / Doe", itemCode: "WIG:42",
    orderDate: "2026-09-23", priceCents: 10_000, taxCents: 663,
    totalCents: 10_663, amountPaidCents: 5_000, amountDueCents: 5_663,
    taxRateMilliPercent: 6625, needsReview: false, phone: "", email: "", notes: "",
    ...changes,
  } as WigOrder;
  sendReceiptPdf(response, { id: 7, issuedAt: new Date("2026-09-23T12:00:00Z"), snapshot }, inline);
  return { headers, done };
}

function pageCount(body: Buffer) {
  return (body.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
}

test("view renders the original order name and code inline as a PDF", async () => {
  const { headers, done } = render(true);
  assert.equal(headers.get("Content-Disposition"), 'inline; filename="Jane-Doe-WIG-42-RW-7.pdf"');
  assert.equal(headers.get("Content-Type"), "application/pdf");
  assert.equal(headers.get("Cache-Control"), "private, no-store");
  const body = await done;
  assert.equal(body.subarray(0, 4).toString(), "%PDF");
  assert.equal(pageCount(body), 1);
  if (process.env.RECEIPT_PDF_PREVIEW_DIR) {
    await writeFile(join(process.env.RECEIPT_PDF_PREVIEW_DIR, "stock-receipt.pdf"), body);
  }
});

test("download keeps the same descriptive filename as an attachment", async () => {
  const { headers, done } = render(false);
  assert.equal(headers.get("Content-Disposition"), 'attachment; filename="Jane-Doe-WIG-42-RW-7.pdf"');
  await done;
});

test("a normally populated custom order and its notes fit on one page", async () => {
  const { done } = render(true, {
    kind: "custom",
    customerName: "Genevieve Rosenberg",
    itemCode: "CUSTOM-2026-0923",
    phone: "(732) 555-0188", email: "genevieve@example.com",
    style: "Long layered waves", capSize: "Medium", lengthInch: "24",
    hairType: "European human hair", part: "Left",
    layers: "Soft face-framing layers", density: "Medium",
    color: "Chocolate brown", highlights: "Caramel balayage with honey-blonde highlights and natural roots",
    notes: "Custom fitting appointment requested. Please style with a soft side part and keep the natural-looking roots.",
  });
  const body = await done;
  assert.equal(pageCount(body), 1);
  if (process.env.RECEIPT_PDF_PREVIEW_DIR) {
    await writeFile(join(process.env.RECEIPT_PDF_PREVIEW_DIR, "custom-receipt.pdf"), body);
  }
});

test("long custom details and notes flow onto later pages", async () => {
  const { done } = render(true, {
    kind: "custom",
    customerName: "Genevieve Alexandra Rosenberg-Silverstein de la Cruz",
    itemCode: "CUSTOM-HIGHLIGHTS-AND-BALAYAGE-LONG-CODE-2026-0923",
    phone: "(732) 555-0188", email: "genevieve@example.com",
    style: "Long layered waves", capSize: "Medium", lengthInch: "24",
    hairType: "European human hair", part: "Left",
    layers: "Soft face-framing layers", density: "Medium",
    color: "Chocolate brown", highlights: "Caramel balayage with honey-blonde highlights and natural roots",
    notes: "Custom fitting and styling instructions for the order. ".repeat(70),
  });
  const body = await done;
  assert.ok(pageCount(body) >= 2, "long custom receipts must continue onto another page");
  if (process.env.RECEIPT_PDF_PREVIEW_DIR) {
    await writeFile(join(process.env.RECEIPT_PDF_PREVIEW_DIR, "custom-long-receipt.pdf"), body);
  }
});