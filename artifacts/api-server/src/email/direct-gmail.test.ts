import assert from "node:assert/strict";
import test from "node:test";
import { createDirectGmailSender, directGmailConfigured, gmailTransport } from "./direct-gmail";

// Deliberately fake credentials and an injected HTTP client. No live services.
const credentials = {
  clientId: "test-client",
  clientSecret: "test-client-secret",
  refreshToken: "test-refresh-token",
};
const raw = Buffer.from("From: sender@example.com\r\n\r\nTest").toString("base64url");
const tokenResponse = (access_token = "test-access-token", expires_in = 3600) =>
  Response.json({ access_token, expires_in, token_type: "Bearer" });

test("defaults to Replit transport and fails closed for unknown transports", () => {
  assert.equal(gmailTransport({}), "replit");
  assert.equal(gmailTransport({ GMAIL_TRANSPORT: "direct" }), "direct");
  assert.equal(gmailTransport({ GMAIL_TRANSPORT: "smtp" }), null);
});

test("direct Gmail requires every nonblank credential", () => {
  const env = {
    GMAIL_CLIENT_ID: credentials.clientId,
    GMAIL_CLIENT_SECRET: credentials.clientSecret,
    GMAIL_REFRESH_TOKEN: credentials.refreshToken,
  };
  assert.equal(directGmailConfigured(env), true);
  for (const key of Object.keys(env)) {
    assert.equal(directGmailConfigured({ ...env, [key]: undefined }), false);
    assert.equal(directGmailConfigured({ ...env, [key]: "  " }), false);
  }
  assert.throws(() => createDirectGmailSender({ ...credentials, refreshToken: "" }), /incomplete/);
});

test("refreshes over HTTPS and sends exact raw MIME through the Gmail API", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const sender = createDirectGmailSender(credentials, {
    request: async (input, init) => {
      calls.push({ url: String(input), init: init! });
      return calls.length === 1 ? tokenResponse() : Response.json({ id: "test-message" });
    },
  });
  await sender.send(raw);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
  const form = new URLSearchParams(String(calls[0].init.body));
  assert.equal(form.get("grant_type"), "refresh_token");
  assert.equal(form.get("client_id"), credentials.clientId);
  assert.equal(form.get("client_secret"), credentials.clientSecret);
  assert.equal(form.get("refresh_token"), credentials.refreshToken);
  assert.equal(calls[1].url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
  assert.equal(calls[1].init.method, "POST");
  assert.equal(new Headers(calls[1].init.headers).get("Authorization"), "Bearer test-access-token");
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), { raw });
  assert.ok(calls.every(call => call.init.signal instanceof AbortSignal));
});

test("reuses tokens and refreshes them before expiration", async () => {
  let time = 0;
  let refreshes = 0;
  let sends = 0;
  const sender = createDirectGmailSender(credentials, {
    now: () => time,
    request: async (input) => {
      if (String(input).includes("/token")) {
        refreshes++;
        return tokenResponse(`test-token-${refreshes}`);
      }
      sends++;
      return Response.json({ id: `test-message-${sends}` });
    },
  });
  await sender.send(raw);
  time = 100_000;
  await sender.send(raw);
  assert.equal(refreshes, 1);
  time = 3_540_000;
  await sender.send(raw);
  assert.equal(refreshes, 2);
  assert.equal(sends, 3);
});

test("concurrent messages share one refresh, not one message send", async () => {
  let refreshes = 0;
  let sends = 0;
  const sender = createDirectGmailSender(credentials, {
    request: async (input) => {
      if (String(input).includes("/token")) {
        refreshes++;
        await new Promise(resolve => setTimeout(resolve, 10));
        return tokenResponse();
      }
      sends++;
      return Response.json({ id: "test-message" });
    },
  });
  await Promise.all([sender.send(raw), sender.send(raw), sender.send(raw)]);
  assert.equal(refreshes, 1);
  assert.equal(sends, 3);
});

test("revoked mailbox authorization fails safely without exposing credentials", async () => {
  let requests = 0;
  const sender = createDirectGmailSender(credentials, {
    request: async () => {
      requests++;
      return Response.json({
        error: "invalid_grant",
        error_description: `${credentials.refreshToken} ${credentials.clientSecret}`,
      }, { status: 400 });
    },
  });
  await assert.rejects(sender.send(raw), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /authorize the mailbox again/);
    assert.ok(!error.message.includes(credentials.refreshToken));
    assert.ok(!error.message.includes(credentials.clientSecret));
    return true;
  });
  assert.equal(requests, 1);
});

test("invalid and malformed token responses never reach messages/send", async () => {
  for (const response of [
    Response.json({ error: "invalid_client", error_description: credentials.clientSecret }, { status: 400 }),
    Response.json({ access_token: "test-token", expires_in: 0 }),
    Response.json({ access_token: "test-token", expires_in: 3600, token_type: "other" }),
    new Response("not JSON"),
  ]) {
    let requests = 0;
    const sender = createDirectGmailSender(credentials, {
      request: async () => { requests++; return response; },
    });
    await assert.rejects(sender.send(raw), error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(credentials.clientSecret));
      return true;
    });
    assert.equal(requests, 1);
  }
});

test("network and provider failures are never retried and do not leak details", async () => {
  for (const failure of ["network", "rate-limit", "permission", "server"] as const) {
    let requests = 0;
    const sender = createDirectGmailSender(credentials, {
      request: async () => {
        requests++;
        if (requests === 1) return tokenResponse();
        if (failure === "network") throw new Error(`socket error ${credentials.clientSecret}`);
        return Response.json({ error: { message: credentials.clientSecret } }, {
          status: failure === "rate-limit" ? 429 : failure === "permission" ? 403 : 500,
        });
      },
    });
    await assert.rejects(sender.send(raw), error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(credentials.clientSecret));
      assert.match(error.message, failure === "network" ? /uncertain.*not retried/ : /HTTP/);
      return true;
    });
    assert.equal(requests, 2);
  }
});

test("a rejected token is cleared for the next separate message, not retried", async () => {
  let refreshes = 0;
  let sends = 0;
  const sender = createDirectGmailSender(credentials, {
    request: async (input) => {
      if (String(input).includes("/token")) {
        refreshes++;
        return tokenResponse(`test-token-${refreshes}`);
      }
      sends++;
      return sends === 1 ? new Response(null, { status: 401 }) : Response.json({ id: "test-message" });
    },
  });
  await assert.rejects(sender.send(raw), /HTTP 401.*not retried/);
  assert.equal(sends, 1);
  await sender.send(raw);
  assert.equal(refreshes, 2);
  assert.equal(sends, 2);
});

test("unencoded messages fail without making an HTTP request", async () => {
  let requests = 0;
  const sender = createDirectGmailSender(credentials, {
    request: async () => { requests++; return tokenResponse(); },
  });
  await assert.rejects(sender.send("From: sender@example.com\r\n\r\nTest"), /base64url/);
  assert.equal(requests, 0);
});