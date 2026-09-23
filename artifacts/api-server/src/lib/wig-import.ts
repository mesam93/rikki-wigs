import ExcelJS from "exceljs";
import { calculateAmounts } from "./wig-orders";

export type HistoricalOrder = {
  kind: "stock" | "custom";
  itemCode: string | null;
  orderDate: string | null;
  customerName: string | null;
  phone: string;
  email: string;
  notes: string;
  style: string;
  capSize: string;
  lengthInch: string;
  hairType: string;
  part: string;
  layers: string;
  density: string;
  color: string;
  highlights: string;
  priceCents: number | null;
  taxRateMilliPercent: number;
  amountPaidCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  amountDueCents: number | null;
  needsReview: boolean;
  reviewIssues: string[];
  sourceSheet: string;
  sourceRowNumber: number;
  sourceValues: Record<string, string>;
};

function cell(row: ExcelJS.Row, index: number): string {
  const value = row.getCell(index).value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return String(value.result ?? "").trim();
    if ("text" in value) return String(value.text ?? "").trim();
    return "";
  }
  return String(value).trim();
}

function money(value: string): number | null {
  if (!value.trim()) return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 1_000_000_000 ? cents : null;
}

function date(value: string): string | null {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = parsed.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && value !== day) return null;
  return day;
}

export async function parseHistoricalWorkbook(buffer: Buffer): Promise<HistoricalOrder[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const orders: HistoricalOrder[] = [];
  const seenCodes = new Set<string>();
  for (const [sheetName, kind, meaningfulWidth, businessWidth] of [
    ["Stock Wigs", "stock", 8, 11],
    ["Custom Wigs", "custom", 16, 19],
  ] as const) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) throw new Error(`Missing ${sheetName} sheet`);
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const read = (index: number) => cell(row, index);
      const sourceValues: Record<string, string> = {};
      for (let col = 1; col <= businessWidth; col++) {
        const value = read(col);
        if (value) sourceValues[String.fromCharCode(64 + col)] = value;
      }
      if (!Array.from({ length: meaningfulWidth }, (_, col) => read(col + 1)).some(Boolean)) continue;

      const code = read(kind === "stock" ? 3 : 1);
      const name = read(kind === "stock" ? 1 : 3);
      const orderDate = date(read(2));
      const priceCents = money(read(kind === "stock" ? 7 : 14));
      const amountPaidCents = money(read(kind === "stock" ? 8 : 16));
      const reviewIssues: string[] = [];
      if (!code) reviewIssues.push("Missing item code");
      if (!name) reviewIssues.push("Missing customer name");
      if (!orderDate) reviewIssues.push("Missing or invalid order date");
      if (priceCents === null) reviewIssues.push("Missing or invalid price");
      if (amountPaidCents === null) reviewIssues.push("Missing or invalid amount paid");

      const codeKey = `${kind}:${code.toLowerCase()}`;
      let itemCode: string | null = code || null;
      if (code && seenCodes.has(codeKey)) {
        reviewIssues.push("Duplicate item code in workbook; choose a unique code");
        itemCode = null;
      }
      if (code) seenCodes.add(codeKey);

      let amounts: ReturnType<typeof calculateAmounts> | null = null;
      if (priceCents !== null && amountPaidCents !== null) {
        try {
          amounts = calculateAmounts(priceCents, 6625, amountPaidCents);
        } catch {
          reviewIssues.push("Payment exceeds calculated total or contains an invalid amount");
        }
      }
      if (amounts) {
        const originalTax = money(read(kind === "stock" ? 10 : 18));
        const originalTotal = money(read(kind === "stock" ? 11 : 19));
        const originalDue = money(read(kind === "stock" ? 9 : 17));
        if ((originalTax !== null && originalTax !== amounts.taxCents) ||
            (originalTotal !== null && originalTotal !== amounts.totalCents) ||
            (originalDue !== null && originalDue !== amounts.amountDueCents)) {
          reviewIssues.push("Original spreadsheet tax, total, or balance differs from recalculated values");
        }
      }
      orders.push({
        kind, itemCode, orderDate, customerName: name || null,
        phone: read(kind === "stock" ? 4 : 8),
        email: read(kind === "stock" ? 5 : 15),
        notes: kind === "stock" ? read(6) : "",
        style: kind === "custom" ? read(9) : "",
        capSize: kind === "custom" ? read(6) : "",
        lengthInch: kind === "custom" ? read(4) : "",
        hairType: kind === "custom" ? read(7) : "",
        part: kind === "custom" ? read(10) : "",
        layers: kind === "custom" ? read(11) : "",
        density: kind === "custom" ? read(12) : "",
        color: kind === "custom" ? read(5) : "",
        highlights: kind === "custom" ? read(13) : "",
        priceCents, taxRateMilliPercent: 6625, amountPaidCents,
        taxCents: amounts?.taxCents ?? null,
        totalCents: amounts?.totalCents ?? null,
        amountDueCents: amounts?.amountDueCents ?? null,
        needsReview: reviewIssues.length > 0,
        reviewIssues, sourceSheet: sheetName, sourceRowNumber: rowNumber,
        sourceValues,
      });
    }
  }
  return orders;
}