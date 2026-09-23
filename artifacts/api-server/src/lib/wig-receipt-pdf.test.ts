import assert from "node:assert/strict";
import { test } from "node:test";
import { PassThrough } from "node:stream";
import type { Response } from "express";
import type { WigOrder } from "@workspace/db";
import { sendReceiptPdf } from "./wig-receipt-pdf";

function render(inline: boolean) {
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
  } as WigOrder;
  sendReceiptPdf(response, { id: 7, issuedAt: new Date("2026-09-23T12:00:00Z"), snapshot }, inline);
  return { headers, done };
}

test("view renders the original order name and code inline as a PDF", async () => {
  const { headers, done } = render(true);
  assert.equal(headers.get("Content-Disposition"), 'inline; filename="Jane-Doe-WIG-42-RW-7.pdf"');
  assert.equal(headers.get("Content-Type"), "application/pdf");
  assert.equal(headers.get("Cache-Control"), "private, no-store");
  assert.equal((await done).subarray(0, 4).toString(), "%PDF");
});

test("download keeps the same descriptive filename as an attachment", async () => {
  const { headers, done } = render(false);
  assert.equal(headers.get("Content-Disposition"), 'attachment; filename="Jane-Doe-WIG-42-RW-7.pdf"');
  await done;
});