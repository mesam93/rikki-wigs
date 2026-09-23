import { db, wigOrdersTable } from "@workspace/db";
import type { HistoricalOrder } from "./wig-import";
import { planHistoricalImport, sourceKey } from "./wig-import-plan";

export function auditHistoricalOrders(orders: HistoricalOrder[]) {
  const stock = orders.filter(o => o.kind === "stock").length;
  const custom = orders.filter(o => o.kind === "custom").length;
  const flagged = orders.filter(o => o.needsReview).length;
  if (stock !== 19 || custom !== 165 || flagged !== 73)
    throw new Error(`Workbook audit failed: expected 19 stock, 165 custom, 73 review flags; found ${stock}, ${custom}, ${flagged}. No changes made.`);
  return { sourceRows: orders.length, stock, custom, flagged };
}

export async function inspectHistoricalImport(orders: HistoricalOrder[]) {
  const audit = auditHistoricalOrders(orders);
  const existing = await db.select().from(wigOrdersTable);
  const plan = planHistoricalImport(orders, existing);
  return {
    ...audit, dryRun: true, alreadyPresent: plan.alreadyPresent.length,
    wouldImport: plan.toInsert.length, changedSources: plan.changedSources,
    codeCollisions: plan.codeCollisions,
    flaggedRows: orders.filter(o => o.needsReview).map(sourceKey),
  };
}

export async function applyHistoricalImport(orders: HistoricalOrder[]) {
  const audit = auditHistoricalOrders(orders);
  const imported = await db.transaction(async tx => {
    const existing = await tx.select().from(wigOrdersTable);
    const plan = planHistoricalImport(orders, existing);
    if (plan.changedSources.length || plan.codeCollisions.length)
      throw new Error(`Import stopped for review: ${JSON.stringify({
        changedSources: plan.changedSources, codeCollisions: plan.codeCollisions,
      })}`);
    for (const order of plan.toInsert) {
      const [created] = await tx.insert(wigOrdersTable).values(order).onConflictDoNothing().returning({ id: wigOrdersTable.id });
      if (!created) throw new Error(`Could not save ${sourceKey(order)}; transaction rolled back`);
    }
    const persisted = await tx.select().from(wigOrdersTable);
    const verified = planHistoricalImport(orders, persisted);
    if (verified.toInsert.length || verified.changedSources.length)
      throw new Error("Source row reconciliation failed; transaction rolled back");
    return plan.toInsert.length;
  });
  return { ...audit, imported, alreadyPresent: audit.sourceRows - imported };
}