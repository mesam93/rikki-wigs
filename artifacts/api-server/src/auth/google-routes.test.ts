import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import session from "express-session";
import type { Server } from "node:http";
import { createGoogleAuthRouter } from "../routes/google-auth";
import { requireAdmin } from "../middlewares/requireAdmin";
import type { GoogleConfig } from "./google-policy";
import { GetAuthSessionResponse } from "@workspace/api-zod";

let server: Server;
let origin: string;
let exchanges = 0;
const previousAdmin = process.env.ADMIN_EMAIL;
const store = new session.MemoryStore(); // Isolated tests only; live app uses PostgreSQL.
let enabled = true;
const config = (): GoogleConfig | null => enabled ? {
  clientId: "test-client", clientSecret: "not-a-real-secret",
  redirectUri: `${origin}/api/auth/google/callback`, origin,
} : null;
before(async () => {
  process.env.ADMIN_EMAIL = "owner@auth-example.test";
  const app = express();
  app.use(session({
    secret: "isolated-unit-test-signature-not-a-production-secret", store,
    name: "rikki_google_session", resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  }));
  app.use("/api", createGoogleAuthRouter({
    config,
    exchange: async (_config, _flow, code) => {
      exchanges++;
      if (code === "reject") throw new Error("sensitive-provider-error");
      return { id: `google-${code}`, email: `${code}@auth-example.test`,
        firstName: code, name: code, googleVerified: true, authenticatedAt: Date.now() };
    },
  }));
  app.get("/api/admin-test", requireAdmin, (_req, res) => res.json({ allowed: true }));
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test listener is missing");
  origin = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (previousAdmin === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = previousAdmin;
  store.clear();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
const request = (path: string, cookie = "", init: RequestInit = {}) =>
  fetch(`${origin}${path}`, { ...init, redirect: "manual", headers: { Cookie: cookie, ...init.headers } });
const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";
const sessionOf = async (cookie: string) =>
  GetAuthSessionResponse.parse(await (await request("/api/auth/session", cookie)).json());
async function start() {
  const res = await request("/api/auth/google/start");
  assert.equal(res.status, 302);
  const url = new URL(res.headers.get("location")!);
  return { cookie: cookieOf(res), state: url.searchParams.get("state")! };
}
async function login(code: string) {
  const flow = await start();
  const res = await request(`/api/auth/google/callback?code=${code}&state=${flow.state}`, flow.cookie);
  assert.equal(res.headers.get("location"), "/client/account");
  return { cookie: cookieOf(res), previousCookie: flow.cookie };
}

test("unconfigured sign-in fails explicitly and unsigned session is private", async () => {
  enabled = false;
  const res = await request("/api/auth/session");
  assert.match(res.headers.get("cache-control")!, /no-store/);
  assert.deepEqual(await res.json(), { configured: false, user: null });
  assert.equal((await request("/api/auth/google/start")).status, 503);
  enabled = true;
});
test("missing state, mismatched state and a missing browser cookie never exchange a code", async () => {
  const flow = await start();
  const beforeCount = exchanges;
  for (const [cookie, state] of [["", flow.state], [flow.cookie, "wrong"], [flow.cookie, ""]]) {
    const res = await request(`/api/auth/google/callback?code=owner&state=${state}`, cookie);
    assert.equal(res.headers.get("location"), "/client/sign-in?error=expired");
  }
  assert.equal(exchanges, beforeCount);
});
test("Google callback rotates the session and does not trust forged cookies", async () => {
  const { cookie, previousCookie } = await login("owner");
  assert.notEqual(cookie, previousCookie);
  const res = await request("/api/auth/session", cookie);
  const data = GetAuthSessionResponse.parse(await res.json());
  assert.ok(data.user);
  assert.equal(data.user.email, "owner@auth-example.test");
  assert.equal(data.user.isAdmin, true);
  assert.equal((await request("/api/admin-test", cookie)).status, 200);
  assert.equal((await request("/api/admin-test", previousCookie)).status, 401);
  assert.equal((await request("/api/admin-test", "rikki_google_session=s%3Aforged.invalid")).status, 401);
});
test("ordinary verified Google clients cannot access admin routes", async () => {
  const { cookie } = await login("client");
  assert.equal((await request("/api/admin-test", cookie)).status, 403);
  assert.equal((await sessionOf(cookie)).user?.isAdmin, false);
});
test("logout rejects cross-origin requests and invalidates the old session", async () => {
  const { cookie } = await login("client");
  assert.equal((await request("/api/auth/logout", cookie, { method: "POST",
    headers: { Origin: "https://attacker.example" } })).status, 403);
  assert.equal((await request("/api/auth/logout", cookie, { method: "POST",
    headers: { Origin: origin } })).status, 204);
  assert.equal((await sessionOf(cookie)).user, null);
});
test("cancelled and failed Google attempts use safe errors and cannot replay state", async () => {
  const flow = await start();
  const cancelled = await request(`/api/auth/google/callback?error=access_denied&state=${flow.state}`, flow.cookie);
  assert.equal(cancelled.headers.get("location"), "/client/sign-in?error=cancelled");
  const replay = await request(`/api/auth/google/callback?code=owner&state=${flow.state}`, flow.cookie);
  assert.equal(replay.headers.get("location"), "/client/sign-in?error=expired");
  const failedFlow = await start();
  const failed = await request(`/api/auth/google/callback?code=reject&state=${failedFlow.state}`, failedFlow.cookie);
  assert.equal(failed.headers.get("location"), "/client/sign-in?error=google_failed");
  assert.doesNotMatch(await failed.text(), /sensitive-provider-error/);
});
