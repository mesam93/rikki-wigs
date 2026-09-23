import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateAmounts } from "./wig-orders";
import { parseHistoricalWorkbook } from "./wig-import";
import ExcelJS from "exceljs";

test("tax, total, balance and partial payment use integer cents", () => {
  assert.deepEqual(calculateAmounts(100_000, 6625, 25_000), {
    taxCents: 6625, totalCents: 106_625, amountDueCents: 81_625,
  });
  assert.deepEqual(calculateAmounts(101, 6625, 0), {
    taxCents: 7, totalCents: 108, amountDueCents: 108,
  });
  assert.throws(() => calculateAmounts(100, 0, 101), /cannot exceed/);
  assert.throws(() => calculateAmounts(-100, 6625, 0), /valid non-negative/);
});

test("original workbook preserves every business-sheet row with source traceability", async () => {
  // The source ZIP contains Orders.xlsx; locate it without extracting private rows to disk.
  const unzipper = await import("node:child_process");
  const buffer = unzipper.execFileSync("unzip", ["-p", "attached_assets/drive-download-20260923T082739Z-1-001_1790152172062.zip", "Orders.xlsx"]);
  const rows = await parseHistoricalWorkbook(buffer);
  assert.equal(rows.length, 184);
  assert.equal(rows.filter(row => row.sourceSheet === "Stock Wigs").length, 19);
  assert.equal(rows.filter(row => row.sourceSheet === "Custom Wigs").length, 165);
  assert.ok(rows.some(row => row.needsReview));
  assert.ok(rows.every(row => row.sourceRowNumber > 1 && !("mergedDocUrl" in row)));
  assert.ok(rows.every(row => Object.keys(row.sourceValues).length > 0));
});

test("historical parser does not cap meaningful rows at the old upload limit", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Stock Wigs");
  const custom = workbook.addWorksheet("Custom Wigs");
  for (let i = 2; i <= 502; i++) {
    custom.getRow(i).getCell(1).value = `C-${i}`;
    custom.getRow(i).getCell(2).value = "2026-09-23";
    custom.getRow(i).getCell(3).value = "Test Customer";
    custom.getRow(i).getCell(14).value = 100;
  }
  const file = await workbook.xlsx.writeBuffer();
  const rows = await parseHistoricalWorkbook(Buffer.from(file));
  assert.equal(rows.length, 501);
  assert.equal(rows.filter(row => row.needsReview).length, 501);
});