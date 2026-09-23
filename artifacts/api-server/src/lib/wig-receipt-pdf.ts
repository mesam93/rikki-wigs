import PDFDocument from "pdfkit";
import type { Response } from "express";
import type { WigOrder } from "@workspace/db";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function sendReceiptPdf(res: Response, receipt: {
  id: number; issuedAt: Date; snapshot: WigOrder;
}) {
  const order = receipt.snapshot;
  const pdf = new PDFDocument({ size: "LETTER", margin: 55 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `attachment; filename="rikki-receipt-${receipt.id}.pdf"`);
  pdf.pipe(res);
  pdf.font("Helvetica-Bold").fontSize(26).fillColor("#301f28").text("Rikki Wigs");
  pdf.font("Helvetica").fontSize(10).fillColor("#685862")
    .text("427 Denison St.  |  Highland Park, NJ  |  (732) 742-4559");
  pdf.moveDown(1.3);
  pdf.font("Helvetica-Bold").fontSize(17).fillColor("#301f28").text("RECEIPT");
  pdf.font("Helvetica").fontSize(10).text(`Receipt #RW-${receipt.id}    •    Item code ${order.itemCode}`);
  pdf.text(`Issued ${receipt.issuedAt.toLocaleDateString("en-US", { timeZone: "America/New_York" })}    •    Order ${order.orderDate}`);
  pdf.moveDown();
  pdf.moveTo(55, pdf.y).lineTo(557, pdf.y).strokeColor("#e0cdd4").stroke();
  pdf.moveDown();
  const line = (label: string, value: string) => {
    pdf.font("Helvetica-Bold").fontSize(10).fillColor("#685862").text(label, 55, pdf.y, { continued: true });
    pdf.font("Helvetica").fillColor("#301f28").text(`   ${value || "—"}`);
    pdf.moveDown(0.35);
  };
  line("Name", order.customerName);
  line("Phone number", order.phone);
  if (order.email) line("Email", order.email);
  line("Wig type", order.kind === "custom" ? "Custom wig" : "Stock wig");
  if (order.kind === "custom") {
    const fields: [string, string][] = [
      ["Style", order.style], ["Size cap", order.capSize], ["Length inch", order.lengthInch],
      ["Hair type", order.hairType], ["Part", order.part], ["Layers", order.layers],
      ["Density", order.density], ["Color", order.color],
      ["Highlights / Balayage / Roots", order.highlights],
    ];
    fields.forEach(([label, value]) => { if (value) line(label, value); });
  }
  if (order.notes) line("Notes", order.notes);
  pdf.moveDown(0.8);
  pdf.moveTo(55, pdf.y).lineTo(557, pdf.y).strokeColor("#e0cdd4").stroke();
  pdf.moveDown();
  line("Price", dollars(order.priceCents));
  line(`Tax (${(order.taxRateMilliPercent / 1000).toFixed(3)}%)`, dollars(order.taxCents));
  line("Total", dollars(order.totalCents));
  line("Amount paid", dollars(order.amountPaidCents));
  pdf.font("Helvetica-Bold").fontSize(13).fillColor("#301f28").text(`Amount due   ${dollars(order.amountDueCents)}`);
  pdf.moveDown(1.3);
  pdf.font("Helvetica").fontSize(9).fillColor("#685862")
    .text("Thank you for choosing Rikki Wigs. This receipt records the payment and balance at the time it was issued.");
  pdf.end();
}