import assert from "node:assert/strict";
import test from "node:test";
import { createDirectCalendarClient } from "./direct-calendar";

const credentials = { clientId: "test-client", clientSecret: "test-secret", refreshToken: "test-refresh" };
const token = () => Response.json({ access_token: "test-access", expires_in: 3600, token_type: "Bearer" });

test("direct Calendar refreshes and supports read, create, update and delete without transport retries", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createDirectCalendarClient(credentials, {
    request: async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return String(url).endsWith("/token") ? token() : Response.json({ id: "rikkir7" });
    },
  });
  await client.request("/users/me/calendarList?fields=items(id)");
  await client.request("/calendars/primary/events?sendUpdates=none", { method: "POST", body: JSON.stringify({ id: "rikkir7" }) });
  await client.request("/calendars/primary/events/rikkir7?sendUpdates=none", { method: "PATCH", body: "{}" });
  await client.request("/calendars/primary/events/rikkir7?sendUpdates=none", { method: "DELETE" });
  assert.equal(calls.length, 5);
  const form = new URLSearchParams(String(calls[0].init.body));
  assert.equal(form.get("grant_type"), "refresh_token");
  assert.equal(form.get("refresh_token"), credentials.refreshToken);
  for (const call of calls.slice(1)) {
    assert.match(call.url, /^https:\/\/www.googleapis.com\/calendar\/v3\//);
    assert.equal(new Headers(call.init.headers).get("Authorization"), "Bearer test-access");
    assert.equal(call.init.redirect, "error");
    assert.ok(call.init.signal instanceof AbortSignal);
  }
  assert.deepEqual(JSON.parse(String(calls[2].init.body)), { id: "rikkir7" });
});

test("concurrent reads share refresh and refresh again before token expiry", async () => {
  let refreshes = 0;
  let time = 0;
  const client = createDirectCalendarClient(credentials, {
    now: () => time,
    request: async url => {
      if (String(url).endsWith("/token")) {
        refreshes++;
        await new Promise(resolve => setTimeout(resolve, 5));
        return token();
      }
      return Response.json({ items: [] });
    },
  });
  await Promise.all([client.request("/users/me/calendarList"), client.request("/users/me/calendarList")]);
  assert.equal(refreshes, 1);
  time = 3_540_000;
  await client.request("/users/me/calendarList");
  assert.equal(refreshes, 2);
});

test("HTTP statuses needed for idempotent reconciliation survive, without raw provider errors", async () => {
  for (const status of [401, 403, 404, 409, 410, 429, 500]) {
    let requests = 0;
    const client = createDirectCalendarClient(credentials, {
      request: async () => ++requests === 1 ? token()
        : Response.json({ error: { message: credentials.clientSecret } }, { status }),
    });
    await assert.rejects(client.request("/calendars/primary/events/rikkir7", { method: "PATCH" }), error => {
      assert.ok(error instanceof Error);
      assert.equal((error as Error & { status: number }).status, status);
      assert.ok(!error.message.includes(credentials.clientSecret));
      return true;
    });
    assert.equal(requests, 2);
  }
});

test("revoked and malformed authorization never reaches Calendar endpoints or exposes secrets", async () => {
  for (const response of [
    Response.json({ error: "invalid_grant", error_description: credentials.refreshToken }, { status: 400 }),
    Response.json({ error: "invalid_client", error_description: credentials.clientSecret }, { status: 400 }),
    Response.json({ access_token: "test-token", expires_in: 0 }),
    new Response("not JSON"),
  ]) {
    let requests = 0;
    const client = createDirectCalendarClient(credentials, { request: async () => { requests++; return response; } });
    await assert.rejects(client.request("/users/me/calendarList"), error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(credentials.clientSecret) && !error.message.includes(credentials.refreshToken));
      return true;
    });
    assert.equal(requests, 1);
  }
});

test("ambiguous writes are not retried and arbitrary URLs are rejected before authorization", async () => {
  let requests = 0;
  const client = createDirectCalendarClient(credentials, {
    request: async () => {
      if (++requests === 1) return token();
      throw new Error(credentials.clientSecret);
    },
  });
  await assert.rejects(client.request("https://example.com/"), /Invalid Calendar API path/);
  assert.equal(requests, 0);
  await assert.rejects(client.request("/calendars/primary/events", { method: "POST", body: "{}" }), /no transport retry/);
  assert.equal(requests, 2);
});