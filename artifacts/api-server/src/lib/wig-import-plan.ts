import type { HistoricalOrder } from "./wig-import";

type SavedOrder = {
  kind: "stock" | "custom";
  itemCode: string | null;
  sourceSheet: string | null;
  sourceRowNumber: number | null;
  sourceValues: Record<string, string> | null;
};

export function sourceKey(order: Pick<HistoricalOrder, "sourceSheet" | "sourceRowNumber">) {
  return `${order.sourceSheet}:${order.sourceRowNumber}`;
}

export function planHistoricalImport(orders: HistoricalOrder[], existing: SavedOrder[]) {
  const bySource = new Map(existing.filter(row => row.sourceSheet && row.sourceRowNumber != null)
    .map(row => [sourceKey({ sourceSheet: row.sourceSheet!, sourceRowNumber: row.sourceRowNumber! }), row]));
  const codes = new Set(existing.filter(row => row.itemCode)
    .map(row => `${row.kind}:${row.itemCode!.toLowerCase()}`));
  const toInsert: HistoricalOrder[] = [];
  const alreadyPresent: string[] = [];
  const changedSources: string[] = [];
  const codeCollisions: string[] = [];

  for (const order of orders) {
    const key = sourceKey(order);
    const saved = bySource.get(key);
    if (saved) {
      alreadyPresent.push(key);
      if (saved.kind !== order.kind || JSON.stringify(saved.sourceValues) !== JSON.stringify(order.sourceValues)) {
        changedSources.push(key);
      }
      continue;
    }
    toInsert.push(order);
    if (order.itemCode) {
      const code = `${order.kind}:${order.itemCode.toLowerCase()}`;
      if (codes.has(code)) codeCollisions.push(key);
      codes.add(code);
    }
  }
  return { toInsert, alreadyPresent, changedSources, codeCollisions };
}