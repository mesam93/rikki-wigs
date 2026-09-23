import ExcelJS from "exceljs";
import { CreateWigOrderBody } from "@workspace/api-zod";
import { calculateAmounts } from "./wig-orders";

export type ImportIssue = { sheet: string; rowNumber: number; reason: string };
export type ImportRow = { sheet: string; rowNumber: number; order: Record<string, unknown> };

function cell(row: ExcelJS.Row, index: number): string {
  const value = row.getCell(index).value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return String(value.result ?? "");
    if ("text" in value) return String(value.text ?? "");
    return "";
  }
  return String(value).trim();
}

function money(value: string): number | null {
  if (!value.trim()) return 0;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

function date(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const day = value.slice(0, 10);
    return !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? day : null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export async function previewWorkbook(buffer: Buffer, existingKeys: Set<string>) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const rows: ImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  for (const [sheetName, kind] of [["Stock Wigs", "stock"], ["Custom Wigs", "custom"]] as const) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) throw new Error(`Workbook is missing the ${sheetName} sheet`);
    if (sheet.rowCount > 1500) throw new Error(`${sheetName} contains too many rows`);
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const read = (index: number) => cell(row, index);
      const code = read(kind === "stock" ? 3 : 1);
      const name = read(kind === "stock" ? 1 : 3);
      const price = money(read(kind === "stock" ? 7 : 14));
      const paid = money(read(kind === "stock" ? 8 : 16));
      const orderDate = date(read(2));
      if (!code && !name && !read(kind === "stock" ? 7 : 14)) continue;
      const reason = !code ? "Missing item code" : !name ? "Missing customer name" :
        !orderDate ? "Invalid or missing date" : price === null ? "Invalid price" :
        paid === null ? "Invalid amount paid" : "";
      if (reason) { issues.push({ sheet: sheetName, rowNumber, reason }); continue; }
      const key = `${kind}:${code.toLowerCase()}`;
      if (existingKeys.has(key) || seen.has(key)) {
        issues.push({ sheet: sheetName, rowNumber, reason: "Duplicate item code for this order type" });
        continue;
      }
      const order = {
        kind, itemCode: code, customerName: name, orderDate,
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
        priceCents: price!, taxRateMilliPercent: 6625, amountPaidCents: paid!,
      };
      const parsed = CreateWigOrderBody.safeParse(order);
      if (!parsed.success) {
        issues.push({ sheet: sheetName, rowNumber, reason: "Order contains an invalid or oversized field" });
        continue;
      }
      try {
        calculateAmounts(price!, 6625, paid!);
      } catch {
        issues.push({ sheet: sheetName, rowNumber, reason: "Amount paid exceeds calculated total" });
        continue;
      }
      seen.add(key);
      rows.push({ sheet: sheetName, rowNumber, order });
      if (rows.length > 500) {
        throw new Error("Workbook has more than 500 valid orders. Split it into smaller workbooks before importing.");
      }
    }
  }
  return { rows, issues };
}