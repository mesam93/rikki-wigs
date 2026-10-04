import assert from "node:assert/strict";
import test from "node:test";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { appointmentsTable, appointmentCalendarSyncTable, calendarSyncSettingsTable, db, pool } from "@workspace/db";
import { reconcileCalendarInBackground, retryCalendarSync, syncAppointment, trySyncAppointment } from "./calendar-sync";

test("all disabled sync entry points perform zero database or connector operations", async () => {
  const flag = process.env.CALENDAR_SYNC_ENABLED;
  const originals = { connect: pool.connect, select: db.select, insert: db.insert,
    update: db.update, proxy: ReplitConnectors.prototype.proxy };
  let accesses = 0;
  const fail = () => { accesses++; throw new Error("Disabled sync accessed a dependency"); };
  try {
    process.env.CALENDAR_SYNC_ENABLED = "false";
    pool.connect = fail;
    db.select = fail;
    db.insert = fail;
    db.update = fail;
    ReplitConnectors.prototype.proxy = fail;
    await syncAppointment(123);
    await trySyncAppointment(123);
    assert.deepEqual(await retryCalendarSync(), { processed: 0, failed: 0 });
    await reconcileCalendarInBackground();
    assert.equal(accesses, 0);
  } finally {
    pool.connect = originals.connect;
    db.select = originals.select;
    db.insert = originals.insert;
    db.update = originals.update;
    ReplitConnectors.prototype.proxy = originals.proxy;
    if (flag === undefined) delete process.env.CALENDAR_SYNC_ENABLED;
    else process.env.CALENDAR_SYNC_ENABLED = flag;
  }
});

test("mocked reconciliation recovers uncertain creation, preserves stored links, updates and removes idempotently", async () => {
  // Every database and HTTP dependency is replaced before invoking the worker.
  // These are synthetic in-memory records, never customer appointments.
  const keys = ["CALENDAR_TRANSPORT", "CALENDAR_SYNC_ENABLED", "CALENDAR_EVENT_NAMESPACE",
    "CALENDAR_CLIENT_ID", "CALENDAR_CLIENT_SECRET", "CALENDAR_REFRESH_TOKEN"] as const;
  const oldEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originals = { connect: pool.connect, select: db.select, insert: db.insert, update: db.update, fetch: globalThis.fetch };
  const appointment = { id: 7, status: "confirmed", service: "Synthetic test", appointmentDate: "2099-05-04",
    appointmentTime: "10:00 AM", serviceDurationMinutes: 30 };
  let record: Record<string, unknown> | undefined;
  const events = new Map<string, unknown>();
  const calls: { method: string; id: string | undefined; body: Record<string, unknown> | undefined }[] = [];
  let loseFirstCreationResponse = true;
  try {
    Object.assign(process.env, { CALENDAR_TRANSPORT: "direct", CALENDAR_SYNC_ENABLED: "true",
      CALENDAR_EVENT_NAMESPACE: "railway", CALENDAR_CLIENT_ID: "test-worker-client",
      CALENDAR_CLIENT_SECRET: "test-worker-secret", CALENDAR_REFRESH_TOKEN: "test-worker-refresh" });
    pool.connect = (async () => ({ query: async () => ({ rows: [] }), release: () => {} })) as unknown as typeof pool.connect;
    db.select = (() => ({ from: (table: unknown) => ({ where: async () =>
      table === appointmentsTable ? [appointment] : table === appointmentCalendarSyncTable ? (record ? [record] : [])
        : table === calendarSyncSettingsTable ? [] : assert.fail("Unexpected table") }) })) as unknown as typeof db.select;
    db.insert = (() => ({ values: (values: Record<string, unknown>) => ({ onConflictDoNothing: () => ({
      returning: async () => {
        record = { status: "pending", attempts: 0, deleted: false, ...values };
        return [record];
      },
    }) }) })) as unknown as typeof db.insert;
    db.update = (() => ({ set: (values: Record<string, unknown>) => ({
      where: async () => { Object.assign(record!, values); },
    }) })) as unknown as typeof db.update;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "test-worker-access", expires_in: 3600, token_type: "Bearer" });
      }
      assert.match(url, /^https:\/\/www.googleapis.com\/calendar\/v3\/calendars\/primary\/events/);
      assert.equal(new URL(url).searchParams.get("sendUpdates"), "none");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const id = method === "POST" ? body?.id : new URL(url).pathname.split("/").pop();
      calls.push({ method, id, body });
      if (method === "POST") {
        events.set(id, body);
        if (loseFirstCreationResponse) { loseFirstCreationResponse = false; throw new Error("Synthetic lost response"); }
      } else if (method === "PATCH") {
        if (!events.has(id)) return new Response(null, { status: 404 });
        events.set(id, body);
      } else if (method === "DELETE") {
        events.delete(id);
        return new Response(null, { status: 204 });
      } else assert.fail("Unexpected Calendar method");
      return Response.json({ id });
    };
    await assert.rejects(syncAppointment(7), /no transport retry/);
    assert.equal(record!.eventId, "rikkir7");
    assert.equal(events.size, 1);
    assert.equal(record!.status, "failed");
    await syncAppointment(7);
    assert.equal(events.size, 1);
    assert.equal(record!.status, "synced");
    assert.equal(calls.filter(call => call.method === "POST").length, 1);
    appointment.appointmentTime = "11:00 AM";
    await syncAppointment(7);
    assert.match(JSON.stringify(events.get("rikkir7")), /11:00:00/);
    // A migrated Replit link is deliberately retained, not renamed to Railway.
    record!.eventId = "rikkip7";
    events.set("rikkip7", {});
    await syncAppointment(7);
    assert.equal(calls.at(-1)!.id, "rikkip7");
    assert.equal(record!.eventId, "rikkip7");
    appointment.status = "cancelled";
    await syncAppointment(7);
    assert.equal(events.has("rikkip7"), false);
    assert.equal(record!.status, "removed");
    const count = calls.length;
    await syncAppointment(7);
    assert.equal(calls.length, count);
  } finally {
    pool.connect = originals.connect;
    db.select = originals.select;
    db.insert = originals.insert;
    db.update = originals.update;
    globalThis.fetch = originals.fetch;
    for (const key of keys) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
  }
});