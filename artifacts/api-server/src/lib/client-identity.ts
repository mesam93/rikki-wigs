import { clientsTable, type db } from "@workspace/db";
import { validClientEmail } from "./verified-email";
export { normalizedEmail, validClientEmail } from "./verified-email";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function ensureClient(tx: DatabaseTransaction, email: string): Promise<void> {
  const normalized = validClientEmail(email);
  if (normalized) {
    await tx.insert(clientsTable).values({ email: normalized }).onConflictDoNothing();
  }
}