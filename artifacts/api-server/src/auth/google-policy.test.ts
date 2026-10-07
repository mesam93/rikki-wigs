import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGoogleFlow, currentGoogleIdentity, FLOW_MAX_AGE, googleAuthorizationUrl,
  googleConfig, identityFromVerifiedPayload, isGoogleAdmin,
  SESSION_ABSOLUTE_MAX_AGE, validGoogleFlow,
} from "./google-policy";

test("OAuth configuration requires an exact safe callback and all credentials", () => {
  const env = { NODE_ENV: "production", GOOGLE_OAUTH_CLIENT_ID: "unit-client",
    GOOGLE_OAUTH_CLIENT_SECRET: "unit-only-secret",
    GOOGLE_OAUTH_REDIRECT_URI: "https://www.rikkiwigs.com/api/auth/google/callback" };
  assert.equal(googleConfig(env)?.origin, "https://www.rikkiwigs.com");
  for (const uri of ["http://www.rikkiwigs.com/api/auth/google/callback",
    "https://www.rikkiwigs.com/other", "https://user:pass@www.rikkiwigs.com/api/auth/google/callback",
    "https://www.rikkiwigs.com/api/auth/google/callback?next=https://evil.example"]) {
    assert.equal(googleConfig({ ...env, GOOGLE_OAUTH_REDIRECT_URI: uri }), null);
  }
  assert.equal(googleConfig({ ...env, GOOGLE_OAUTH_CLIENT_SECRET: "" }), null);
});

test("state is random, bound to browser flow, time-limited and scalar", () => {
  const flow = createGoogleFlow(1000);
  assert.notEqual(flow.state, createGoogleFlow(1000).state);
  assert.equal(validGoogleFlow(flow, flow.state, 1001), true);
  assert.equal(validGoogleFlow(flow, "wrong", 1001), false);
  assert.equal(validGoogleFlow(flow, [flow.state], 1001), false);
  assert.equal(validGoogleFlow(flow, flow.state, 1000 + FLOW_MAX_AGE + 1), false);
  assert.equal(validGoogleFlow(flow, flow.state, 999), false);
});

test("authorization requests only identity scopes with PKCE and nonce", () => {
  const flow = createGoogleFlow();
  const url = new URL(googleAuthorizationUrl({
    clientId: "unit-client", clientSecret: "unit-only-secret",
    redirectUri: "https://www.rikkiwigs.com/api/auth/google/callback", origin: "https://www.rikkiwigs.com",
  }, flow));
  assert.equal(url.hostname, "accounts.google.com");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("nonce"), flow.nonce);
  assert.equal(url.searchParams.has("client_secret"), false);
  assert.equal(url.searchParams.has("code_verifier"), false);
});

test("identity requires verified email and matching token nonce", () => {
  const payload = { sub: "google-unit-user", email: " Customer@Example.test ",
    email_verified: true, nonce: "unit-nonce", given_name: "Customer" };
  const user = identityFromVerifiedPayload(payload, "unit-nonce", 1000);
  assert.equal(user.email, "customer@example.test");
  assert.equal(user.googleVerified, true);
  assert.throws(() => identityFromVerifiedPayload({ ...payload, email_verified: false }, "unit-nonce"));
  assert.throws(() => identityFromVerifiedPayload({ ...payload, nonce: "other" }, "unit-nonce"));
  assert.throws(() => identityFromVerifiedPayload({ ...payload, email: undefined }, "unit-nonce"));
});

test("absolute session lifetime is enforced and admin identity fails closed", () => {
  const user = identityFromVerifiedPayload({ sub: "owner-unit", email: "owner@example.test",
    email_verified: true, nonce: "nonce" }, "nonce", 1000);
  assert.equal(currentGoogleIdentity(user, 1001), user);
  assert.equal(currentGoogleIdentity(user, 1000 + SESSION_ABSOLUTE_MAX_AGE), null);
  assert.equal(currentGoogleIdentity({ ...user, googleVerified: false } as never, 1001), null);
  assert.equal(isGoogleAdmin(user, " OWNER@EXAMPLE.TEST "), true);
  assert.equal(isGoogleAdmin(user, "someoneelse@example.test"), false);
  assert.equal(isGoogleAdmin(user, ""), false);
});
