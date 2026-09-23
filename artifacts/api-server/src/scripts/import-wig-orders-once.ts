import { execFileSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { db, pool, wigOrdersTable } from "@workspace/db";
import { parseHistoricalWorkbook } from "../lib/wig-import";

async function main() {
  const archive = process.argv[2];
  if (!archive?.endsWith(".zip")) throw new Error("Pass the path to the supplied ZIP archive");
  const workbook = execFileSync("unzip", ["-p", archive, "Orders.xlsx"], { maxBuffer: 20 * 1024 * 1024 });
  const orders = await parseHistoricalWorkbook(workbook);
  if (orders.length !== 184) throw new Error(`Workbook audit expected 184 meaningful rows; found ${orders.length}. No changes made.`);
  const summary = {
    sourceRows: orders.length,
    stock: orders.filter(o => o.kind === "stock").length,
    custom: orders.filter(o => o.kind === "custom").length,
    flagged: orders.filter(o => o.needsReview).length,
    reviewReasons: Object.fromEntries([...new Set(orders.flatMap(o => o.reviewIssues))]
      .map(reason => [reason, orders.filter(o => o.reviewIssues.includes(reason)).length])),
    imported: 0,
    alreadyPresent: 0,
    reconciledReview: 0,
    flaggedRows: orders.filter(o => o.needsReview).map(o => `${o.sourceSheet}:${o.sourceRowNumber}`),
  };
  if (!process.argv.includes("--apply")) {
    process.stdout.write(`${JSON.stringify({ ...summary, dryRun: true })}\n`);
    return;
  }
  await db.transaction(async tx => {
    const existing = await tx.select().from(wigOrdersTable);
    const existingBySource = new Map(existing.filter(o => o.sourceSheet && o.sourceRowNumber)
      .map(o => [`${o.sourceSheet}:${o.sourceRowNumber}`, o]));
    const knownSource = new Set(existing.filter(o => o.sourceSheet && o.sourceRowNumber)
      .map(o => `${o.sourceSheet}:${o.sourceRowNumber}`));
    const knownCodes = new Set(existing.filter(o => o.itemCode)
      .map(o => `${o.kind}:${o.itemCode!.toLowerCase()}`));
    for (const source of orders) {
      const sourceKey = `${source.sourceSheet}:${source.sourceRowNumber}`;
      if (knownSource.has(sourceKey)) {
        summary.alreadyPresent++;
        if (process.argv.includes("--reconcile-review")) {
          const saved = existingBySource.get(sourceKey)!;
          const priorIssues = source.reviewIssues.filter(issue => !issue.startsWith("Original spreadsheet tax, total, or balance differs"));
          if (source.reviewIssues.length > priorIssues.length &&
              JSON.stringify(saved.reviewIssues) === JSON.stringify(priorIssues) &&
              saved.priceCents === source.priceCents && saved.amountPaidCents === source.amountPaidCents &&
              saved.itemCode === source.itemCode && saved.customerName === source.customerName &&
              saved.orderDate === source.orderDate) {
            await tx.update(wigOrdersTable).set({ needsReview: true, reviewIssues: source.reviewIssues })
              .where(eq(wigOrdersTable.id, saved.id));
            summary.reconciledReview++;
          }
        }
        continue;
      }
      const order = { ...source, reviewIssues: [...source.reviewIssues] };
      if (order.itemCode && knownCodes.has(`${order.kind}:${order.itemCode.toLowerCase()}`)) {
        order.reviewIssues.push("Item code already exists in saved orders; choose a unique code");
        order.itemCode = null;
        order.needsReview = true;
        summary.flagged++;
        summary.flaggedRows.push(sourceKey);
      }
      const [created] = await tx.insert(wigOrdersTable).values(order).onConflictDoNothing().returning({ id: wigOrdersTable.id });
      if (!created) throw new Error(`Could not save ${sourceKey}; transaction rolled back`);
      summary.imported++;
      knownSource.add(sourceKey);
      if (order.itemCode) knownCodes.add(`${order.kind}:${order.itemCode.toLowerCase()}`);
    }
    const persisted = await tx.select({ sheet: wigOrdersTable.sourceSheet, row: wigOrdersTable.sourceRowNumber })
      .from(wigOrdersTable);
    const persistedSources = new Set(persisted.filter(row => row.sheet && row.row).map(row => `${row.sheet}:${row.row}`));
    if (orders.some(order => !persistedSources.has(`${order.sourceSheet}:${order.sourceRowNumber}`))) {
      throw new Error("Source row reconciliation failed; transaction rolled back");
    }
  });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "Import failed"}\n`);
  process.exitCode = 1;
}).finally(() => pool.end());