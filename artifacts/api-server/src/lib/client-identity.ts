import { clientsTable, type db } from "@workspace/db";

export function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validClientEmail(value: string): string | null {
  const normalized = normalizedEmail(value);
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized : null;
}

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function ensureClient(tx: DatabaseTransaction, email: string): Promise<void> {
  const normalized = validClientEmail(email);
  if (normalized) {
    await tx.insert(clientsTable).values({ email: normalized }).onConflictDoNothing();
  }
}