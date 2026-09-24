// Milli-percent: 6625 means 6.625%. All monetary values remain integer cents.
export function calculateAmounts(priceCents: number, taxRateMilliPercent: number, amountPaidCents: number, tariffCents = 0) {
  if (![priceCents, taxRateMilliPercent, amountPaidCents, tariffCents].every(Number.isSafeInteger) ||
      priceCents < 0 || priceCents > 1_000_000_000 ||
      taxRateMilliPercent < 0 || taxRateMilliPercent > 100_000 ||
      amountPaidCents < 0 || tariffCents < 0) {
    throw new Error("Enter valid non-negative price, tax rate, and amount paid");
  }
  const taxCents = Math.round(priceCents * taxRateMilliPercent / 100_000);
  const totalCents = priceCents + taxCents + tariffCents;
  if (amountPaidCents > totalCents) throw new Error("Amount paid cannot exceed the total");
  return { taxCents, totalCents, amountDueCents: totalCents - amountPaidCents };
}

export const optionalOrderFields = [
  "phone", "email", "notes", "style", "capSize", "lengthInch",
  "hairType", "part", "layers", "density", "color", "highlights",
] as const;

export function normalizeOrder<T extends {
  kind: "stock" | "custom"; orderDate: string; itemCode: string; customerName: string;
  priceCents: number; taxRateMilliPercent: number; amountPaidCents: number; tariffCents: number;
}>(input: T) {
  return {
    ...input,
    itemCode: String(input.itemCode).trim(),
    customerName: String(input.customerName).trim(),
    ...Object.fromEntries(optionalOrderFields.map(key => [key, String((input as Record<string, unknown>)[key] ?? "").trim()])),
    ...calculateAmounts(
      Number(input.priceCents),
      Number(input.taxRateMilliPercent),
      Number(input.amountPaidCents),
      input.tariffCents,
    ),
  };
}