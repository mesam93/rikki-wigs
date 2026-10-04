import assert from "node:assert/strict";
import test from "node:test";
import { calendarConfig } from "./calendar-config";
import { eventIdForAppointment } from "./calendar-time";

test("Replit keeps existing default sync and event namespaces", () => {
  assert.equal(calendarConfig({}).enabled, true);
  assert.equal(calendarConfig({}).transport, "replit");
  assert.equal(calendarConfig({}).namespace, "development");
  assert.equal(calendarConfig({ REPLIT_DEPLOYMENT: "1" }).namespace, "published");
});

test("direct Calendar is disabled by default, even with credentials", () => {
  const env = { CALENDAR_TRANSPORT: "direct", CALENDAR_CLIENT_ID: "test",
    CALENDAR_CLIENT_SECRET: "test", CALENDAR_REFRESH_TOKEN: "test" };
  assert.equal(calendarConfig(env).enabled, false);
  assert.equal(calendarConfig(env).namespace, "railway");
  assert.equal(calendarConfig({ ...env, CALENDAR_SYNC_ENABLED: "false" }).enabled, false);
  assert.equal(calendarConfig({ ...env, CALENDAR_SYNC_ENABLED: "true" }).enabled, true);
});

test("bad flags, transports, namespaces and incomplete authorization fail closed", () => {
  for (const env of [
    { CALENDAR_SYNC_ENABLED: "invalid" }, { CALENDAR_TRANSPORT: "invalid" },
    { CALENDAR_EVENT_NAMESPACE: "invalid" },
    { CALENDAR_TRANSPORT: "direct", CALENDAR_SYNC_ENABLED: "true" },
    { CALENDAR_TRANSPORT: "direct", CALENDAR_EVENT_NAMESPACE: "published", CALENDAR_SYNC_ENABLED: "true" },
  ]) {
    assert.equal(calendarConfig(env).enabled, false);
    assert.ok(calendarConfig(env).disabledReason);
  }
});

test("new Railway IDs are stable, valid Google IDs, and distinct from both Replit namespaces", () => {
  for (const id of [1, 7, 1024, 100000]) {
    const values = [eventIdForAppointment(id, false), eventIdForAppointment(id, true), eventIdForAppointment(id, "railway")];
    assert.equal(new Set(values).size, 3);
    assert.ok(values.every(value => /^[a-v0-9]{5,1024}$/.test(value)));
    assert.equal(eventIdForAppointment(id, "railway"), values[2]);
  }
});