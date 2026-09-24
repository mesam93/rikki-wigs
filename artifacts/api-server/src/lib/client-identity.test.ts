import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { clientsTable, db, pool, wigOrdersTable, wigReceiptsTable } from "@workspace/db";
import { ensureClient, normalizedEmail, validClientEmail } from "./client-identity";

after(async () => { await pool.end(); });

test("emails normalize without conflating different addresses", () => {
  assert.equal(normalizedEmail("  OWNER+Tag@EXAMPLE.COM  "), "owner+tag@example.com");
  assert.equal(validClientEmail("  OWNER@EXAMPLE.COM "), "owner@example.com");
  assert.equal(validClientEmail("not-an-address"), null);
  assert.notEqual(normalizedEmail("owner+tag@example.com"), normalizedEmail("owner@example.com"));
});

test("repeated saves reuse one identity; receipt ownership uses the issued snapshot only", async () => {
  const email = `${randomUUID()}@example.com`;
  const otherEmail = `${randomUUID()}@example.com`;
  const rolledBack = Symbol("rolled back");
  try {
    await db.transaction(async (tx) => {
      await ensureClient(tx, ` ${email.toUpperCase()} `);
      await ensureClient(tx, email);
      const clients = await tx.select().from(clientsTable).where(eq(clientsTable.email, email));
      assert.equal(clients.length, 1);

      const [order] = await tx.insert(wigOrdersTable).values({ kind: "stock", email: otherEmail }).returning();
      assert.ok(order);
      const [owned] = await tx.insert(wigReceiptsTable)
        .values({ orderId: order.id, snapshot: { ...order, email: ` ${email.toUpperCase()} ` } }).returning();
      const [unassigned] = await tx.insert(wigReceiptsTable)
        .values({ orderId: order.id, snapshot: { ...order, email: "" } }).returning();
      assert.ok(owned && unassigned);

      const forEmail = (target: string) => tx.select({ id: wigReceiptsTable.id })
        .from(wigReceiptsTable).where(and(
          sql`lower(btrim(${wigReceiptsTable.snapshot}->>'email')) = ${target}`,
          sql`${wigReceiptsTable.id} in (${owned.id}, ${unassigned.id})`,
        ));
      assert.deepEqual((await forEmail(email)).map((row) => row.id), [owned.id]);
      assert.deepEqual(await forEmail(otherEmail), []);
      throw rolledBack;
    });
  } catch (error) {
    if (error !== rolledBack) throw error;
  }
});