import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import type { Response } from "express";
import type { WigOrder } from "@workspace/db";

const ink = "#272225";
const muted = "#655e62";
const gold = "#b89b50";
const rule = "#e2d9d5";
const paperTint = "#f8f5f2";
const pageWidth = 612;
const left = 52;
const right = 560;
const bottom = 710;
const logoPath = fileURLToPath(new URL("./assets/rikki-logo-official.png", import.meta.url));

const recorded = (value: string | null) => value?.trim() ? value : "Not recorded";
const dollars = (cents: number | null) => cents === null ? "Not recorded" : `$${(cents / 100).toFixed(2)}`;

function filenamePart(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "order";
}

export function sendReceiptPdf(res: Response, receipt: {
  id: number; issuedAt: Date; snapshot: WigOrder;
}, inline = false) {
  const order = receipt.snapshot;
  const pdf = new PDFDocument({ size: "LETTER", margin: 0, bufferPages: true });
  const customerName = recorded(order.customerName);
  const itemCode = recorded(order.itemCode);
  const incomplete = !order.customerName?.trim() || !order.itemCode?.trim() || !order.orderDate ||
    [order.priceCents, order.taxCents, order.totalCents, order.amountPaidCents, order.amountDueCents]
      .some(value => value === null);
  const title = `${customerName} — ${itemCode}`;
  pdf.info.Title = title;
  const filename = `${filenamePart(customerName)}-${filenamePart(itemCode)}-RW-${receipt.id}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${filename}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  pdf.pipe(res);

  const issuedDate = receipt.issuedAt.toLocaleDateString("en-US", { timeZone: "America/New_York" });
  pdf.rect(0, 0, pageWidth, 106).fill(ink);
  pdf.rect(0, 106, pageWidth, 2).fill(gold);
  pdf.image(logoPath, left, 17, { width: 74 });
  pdf.font("Helvetica-Bold").fontSize(25).fillColor("#ffffff").text("RECEIPT", 147, 27);
  pdf.font("Helvetica").fontSize(9.5).fillColor("#dbc9a5")
    .text(`RW-${receipt.id}   •   Issued ${issuedDate}`, 149, 70, { width: 375 });

  let y = 125;
  const continuation = () => {
    pdf.addPage();
    pdf.rect(0, 0, pageWidth, 65).fill(ink);
    pdf.rect(0, 65, pageWidth, 2).fill(gold);
    pdf.image(logoPath, left, 12, { width: 41 });
    pdf.font("Helvetica-Bold").fontSize(15).fillColor("#ffffff")
      .text(`RECEIPT  RW-${receipt.id}`, 107, 22, { width: 430 });
    y = 89;
  };
  const space = (height: number) => {
    if (y + height > bottom) continuation();
  };
  const wrapped = (value: string, size: number, width: number): string[] => {
    pdf.font("Helvetica").fontSize(size);
    const lines: string[] = [];
    for (const paragraph of value.split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
        const combined = line ? `${line} ${word}` : word;
        if (pdf.widthOfString(combined) <= width) { line = combined; continue; }
        if (line) { lines.push(line); line = ""; }
        if (pdf.widthOfString(word) <= width) { line = word; continue; }
        let piece = "";
        for (const character of word) {
          if (piece && pdf.widthOfString(piece + character) > width) {
            lines.push(piece);
            piece = character;
          } else {
            piece += character;
          }
        }
        line = piece;
      }
      lines.push(line || " ");
    }
    return lines;
  };
  const section = (heading: string, contentHeight = 26) => {
    space(25 + contentHeight);
    pdf.moveTo(left, y).lineTo(right, y).lineWidth(0.8).strokeColor(rule).stroke();
    pdf.font("Helvetica-Bold").fontSize(8.5).fillColor(muted).text(heading, left, y + 8);
    y += 25;
  };
  const row = (label: string, value: string) => {
    const lines = wrapped(value || "Not recorded", 9.5, 379);
    space(20);
    pdf.font("Helvetica-Bold").fontSize(8.5).fillColor(muted).text(label, left, y + 2, { width: 121 });
    for (const line of lines) {
      if (y + 13 > bottom) {
        continuation();
        pdf.font("Helvetica-Bold").fontSize(8.5).fillColor(muted)
          .text(`${label} (continued)`, left, y + 2, { width: 121 });
      }
      pdf.font("Helvetica").fontSize(9.5).fillColor(ink).text(line, 181, y, { lineBreak: false });
      y += 13;
    }
    y += 5;
  };
  const heroLine = (value: string, size: number, height: number, color: string) => {
    for (const line of wrapped(value, size, right - left)) {
      space(height);
      pdf.font("Helvetica-Bold").fontSize(size).fillColor(color).text(line, left, y, { lineBreak: false });
      y += height;
    }
  };

  pdf.font("Helvetica-Bold").fontSize(8.5).fillColor(muted).text("PREPARED FOR", left, y);
  y += 15;
  heroLine(customerName, 19, 23, ink);
  y += 3;
  pdf.font("Helvetica-Bold").fontSize(8.5).fillColor(muted).text("ORDER ITEM CODE", left, y);
  y += 12;
  heroLine(itemCode, 11, 15, ink);
  y += 5;
  space(15);
  pdf.font("Helvetica").fontSize(8.5).fillColor(muted)
    .text(`Order date  ${recorded(order.orderDate)}`, left, y);
  y += 18;

  section("CUSTOMER DETAILS");
  row("Phone number", order.phone);
  if (order.email) row("Email", order.email);

  section("WIG DETAILS");
  row("Wig type", order.kind === "custom" ? "Custom wig" : "Stock wig");
  if (order.kind === "custom") {
    const fields: [string, string][] = [
      ["Style", order.style], ["Size cap", order.capSize], ["Length inch", order.lengthInch],
      ["Hair type", order.hairType], ["Part", order.part], ["Layers", order.layers],
      ["Density", order.density], ["Color", order.color],
      ["Highlights / Balayage / Roots", order.highlights],
    ];
    fields.forEach(([label, value]) => { if (value) row(label, value); });
  }
  if (order.notes) row("Notes", order.notes);

  const hasTariff = (order.tariffCents ?? 0) > 0;
  const cardHeight = hasTariff ? 136 : 116;
  section("PAYMENT SUMMARY", cardHeight + 10);
  space(cardHeight + 10);
  const cardY = y;
  pdf.rect(left, cardY, right - left, cardHeight).fill(paperTint);
  pdf.rect(left, cardY, 3, cardHeight).fill(gold);
  const amountRow = (label: string, amount: string, offset: number, emphasized = false) => {
    pdf.font(emphasized ? "Helvetica-Bold" : "Helvetica")
      .fontSize(emphasized ? 10 : 9.5).fillColor(emphasized ? ink : muted)
      .text(label, left + 20, cardY + offset, { width: 315 });
    pdf.font("Helvetica-Bold").fontSize(emphasized ? 11 : 9.5).fillColor(ink)
      .text(amount, right - 132, cardY + offset - 1, { width: 112, align: "right" });
  };
  amountRow("Price", dollars(order.priceCents), 9);
  amountRow(`Tax (${(order.taxRateMilliPercent / 1000).toFixed(3)}%)`, dollars(order.taxCents), 28);
  if (hasTariff) amountRow("Tariff", dollars(order.tariffCents), 48);
  amountRow("Total", dollars(order.totalCents), hasTariff ? 68 : 48, true);
  amountRow("Amount paid", dollars(order.amountPaidCents), hasTariff ? 89 : 69);
  pdf.moveTo(left + 20, cardY + (hasTariff ? 108 : 88)).lineTo(right - 20, cardY + (hasTariff ? 108 : 88))
    .lineWidth(0.8).strokeColor(rule).stroke();
  amountRow("Amount due", dollars(order.amountDueCents), hasTariff ? 116 : 96, true);

  const pages = pdf.bufferedPageRange();
  for (let page = pages.start; page < pages.start + pages.count; page++) {
    pdf.switchToPage(page);
    pdf.moveTo(left, 728).lineTo(right, 728).lineWidth(0.8).strokeColor(rule).stroke();
    pdf.font("Helvetica").fontSize(8).fillColor(muted)
      .text("427 Denison St.  |  Highland Park, NJ  |  (732) 742-4559", left, 739, { width: 460 });
    pdf.text(incomplete
      ? "Thank you for choosing Rikki Wigs. Missing details were not recorded when this receipt was issued."
      : "Thank you for choosing Rikki Wigs. This receipt records the payment and balance at the time it was issued.",
      left, 755, { width: 440, lineBreak: false });
    pdf.text(`${page - pages.start + 1} / ${pages.count}`, right - 46, 755, { width: 46, align: "right" });
  }
  pdf.end();
}