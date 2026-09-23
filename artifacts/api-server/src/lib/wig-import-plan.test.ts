import assert from "node:assert/strict";
import { test } from "node:test";
import type { HistoricalOrder } from "./wig-import";
import { planHistoricalImport } from "./wig-import-plan";

const source: HistoricalOrder = {
  kind: "stock",
  sourceSheet: "Stock Wigs",
  sourceRowNumber: 2,
  sourceValues: { A: "Original customer", C: "A1" },
  itemCode: "A1",
  orderDate: null, customerName: "Original customer", phone: "", email: "",
  notes: "", style: "", capSize: "", lengthInch: "", hairType: "",
  part: "", layers: "", density: "", color: "", highlights: "",
  priceCents: null, taxRateMilliPercent: 6625, amountPaidCents: null,
  taxCents: null, totalCents: null, amountDueCents: null,
  needsReview: true, reviewIssues: ["Missing or invalid price"],
};

test("a saved source row is not imported twice, even if the order was edited", () => {
  const plan = planHistoricalImport([source], [
    { ...source, itemCode: "Edited" },
  ]);
  assert.equal(plan.toInsert.length, 0);
  assert.deepEqual(plan.alreadyPresent, ["Stock Wigs:2"]);
  assert.deepEqual(plan.changedSources, []);
});

test("changed original source data and colliding codes are reported before any insert", () => {
  const plan = planHistoricalImport([
    source,
    { ...source, sourceRowNumber: 3 },
  ], [
    { ...source, sourceValues: { A: "Different" } },
    { ...source, sourceSheet: null, sourceRowNumber: null },
  ]);
  assert.deepEqual(plan.changedSources, ["Stock Wigs:2"]);
  assert.deepEqual(plan.codeCollisions, ["Stock Wigs:3"]);
  assert.equal(plan.toInsert.length, 1);
});