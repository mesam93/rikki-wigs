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

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function filenamePart(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "order";
}

export function sendReceiptPdf(res: Response, receipt: {
  id: number; issuedAt: Date; snapshot: WigOrder;
}, inline = false) {
  const order = receipt.snapshot;
  if (order.needsReview || order.customerName === null || order.itemCode === null ||
      order.orderDate === null || order.priceCents === null || order.taxCents === null ||
      order.totalCents === null || order.amountPaidCents === null || order.amountDueCents === null) {
    throw new Error("A receipt cannot be generated for an incomplete order");
  }
  const pdf = new PDFDocument({ size: "LETTER", margin: 0, bufferPages: true });
  const title = `${order.customerName} — ${order.itemCode}`;
  pdf.info.Title = title;
  const filename = `${filenamePart(order.customerName)}-${filenamePart(order.itemCode)}-RW-${receipt.id}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${filename}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  pdf.pipe(res);

  const issuedDate = receipt.issuedAt.toLocaleDateString("en-US", { timeZone: "America/New_York" });
  pdf.rect(0, 0, pageWidth, 155).fill(ink);
  pdf.rect(0, 155, pageWidth, 3).fill(gold);
  pdf.image(logoPath, left, 28, { width: 96 });
  pdf.font("Helvetica-Bold").fontSize(28).fillColor("#ffffff").text("RECEIPT", 174, 54);
  pdf.font("Helvetica").fontSize(10).fillColor("#dbc9a5")
    .text(`RW-${receipt.id}   •   Issued ${issuedDate}`, 176, 103, { width: 365 });

  let y = 183;
  const continuation = () => {
    pdf.addPage();
    pdf.rect(0, 0, pageWidth, 83).fill(ink);
    pdf.rect(0, 83, pageWidth, 2).fill(gold);
    pdf.image(logoPath, left, 15, { width: 52 });
    pdf.font("Helvetica-Bold").fontSize(16).fillColor("#ffffff")
      .text(`RECEIPT  RW-${receipt.id}`, 120, 32, { width: 430 });
    y = 110;
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
  const section = (heading: string, contentHeight = 34) => {
    space(36 + contentHeight);
    pdf.moveTo(left, y).lineTo(right, y).lineWidth(0.8).strokeColor(rule).stroke();
    pdf.font("Helvetica-Bold").fontSize(9).fillColor(muted).text(heading, left, y + 12);
    y += 36;
  };
  const row = (label: string, value: string) => {
    const lines = wrapped(value || "—", 10, 357);
    space(25);
    pdf.font("Helvetica-Bold").fontSize(9).fillColor(muted).text(label, left, y + 2, { width: 130 });
    for (const line of lines) {
      if (y + 15 > bottom) {
        continuation();
        pdf.font("Helvetica-Bold").fontSize(9).fillColor(muted)
          .text(`${label} (continued)`, left, y + 2, { width: 130 });
      }
      pdf.font("Helvetica").fontSize(10).fillColor(ink).text(line, 197, y, { lineBreak: false });
      y += 15;
    }
    y += 8;
  };
  const heroLine = (value: string, size: number, height: number, color: string) => {
    for (const line of wrapped(value, size, right - left)) {
      space(height);
      pdf.font("Helvetica-Bold").fontSize(size).fillColor(color).text(line, left, y, { lineBreak: false });
      y += height;
    }
  };

  pdf.font("Helvetica-Bold").fontSize(9).fillColor(muted).text("PREPARED FOR", left, y);
  y += 20;
  heroLine(order.customerName, 21, 27, ink);
  y += 6;
  pdf.font("Helvetica-Bold").fontSize(9).fillColor(muted).text("ORDER ITEM CODE", left, y);
  y += 16;
  heroLine(order.itemCode, 12, 17, ink);
  y += 10;
  space(18);
  pdf.font("Helvetica").fontSize(9).fillColor(muted)
    .text(`Order date  ${order.orderDate}`, left, y);
  y += 23;

  section("CUSTOMER DETAILS");
  row("Name", order.customerName);
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

  section("PAYMENT SUMMARY", 172);
  space(172);
  const cardY = y;
  pdf.rect(left, cardY, right - left, 155).fill(paperTint);
  pdf.rect(left, cardY, 3, 155).fill(gold);
  const amountRow = (label: string, amount: string, offset: number, emphasized = false) => {
    pdf.font(emphasized ? "Helvetica-Bold" : "Helvetica")
      .fontSize(emphasized ? 11 : 10).fillColor(emphasized ? ink : muted)
      .text(label, left + 20, cardY + offset, { width: 315 });
    pdf.font("Helvetica-Bold").fontSize(emphasized ? 12 : 10).fillColor(ink)
      .text(amount, right - 132, cardY + offset - 1, { width: 112, align: "right" });
  };
  amountRow("Price", dollars(order.priceCents), 15);
  amountRow(`Tax (${(order.taxRateMilliPercent / 1000).toFixed(3)}%)`, dollars(order.taxCents), 40);
  amountRow("Total", dollars(order.totalCents), 65, true);
  amountRow("Amount paid", dollars(order.amountPaidCents), 91);
  pdf.moveTo(left + 20, cardY + 118).lineTo(right - 20, cardY + 118)
    .lineWidth(0.8).strokeColor(rule).stroke();
  amountRow("Amount due", dollars(order.amountDueCents), 129, true);

  const pages = pdf.bufferedPageRange();
  for (let page = pages.start; page < pages.start + pages.count; page++) {
    pdf.switchToPage(page);
    pdf.moveTo(left, 728).lineTo(right, 728).lineWidth(0.8).strokeColor(rule).stroke();
    pdf.font("Helvetica").fontSize(8).fillColor(muted)
      .text("427 Denison St.  |  Highland Park, NJ  |  (732) 742-4559", left, 739, { width: 460 });
    pdf.text("Thank you for choosing Rikki Wigs. This receipt records the payment and balance at the time it was issued.",
      left, 755, { width: 440, lineBreak: false });
    pdf.text(`${page - pages.start + 1} / ${pages.count}`, right - 46, 755, { width: 46, align: "right" });
  }
  pdf.end();
}