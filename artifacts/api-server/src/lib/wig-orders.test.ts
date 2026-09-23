import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateAmounts } from "./wig-orders";
import { previewWorkbook } from "./wig-import";
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

test("original workbook produces a private preview, not merged-document metadata", async () => {
  // The source ZIP contains Orders.xlsx; locate it without extracting private rows to disk.
  const unzipper = await import("node:child_process");
  const buffer = unzipper.execFileSync("unzip", ["-p", "attached_assets/drive-download-20260923T082739Z-1-001_1790152172062.zip", "Orders.xlsx"]);
  const result = await previewWorkbook(buffer, new Set());
  assert.ok(result.rows.length > 50);
  assert.ok(result.rows.some(row => row.sheet === "Stock Wigs"));
  assert.ok(result.rows.some(row => row.sheet === "Custom Wigs"));
  assert.ok(result.rows.every(row => row.order.itemCode && !("mergedDocUrl" in row.order)));
  const duplicate = await previewWorkbook(buffer, new Set([`${result.rows[0].order.kind}:${String(result.rows[0].order.itemCode).toLowerCase()}`]));
  assert.ok(duplicate.issues.some(issue => issue.reason.includes("Duplicate")));
});

test("a preview never promises more than the confirmation limit", async () => {
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
  await assert.rejects(
    previewWorkbook(Buffer.from(file), new Set()),
    /more than 500 valid orders/,
  );
});