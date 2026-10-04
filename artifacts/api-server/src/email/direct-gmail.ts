type Environment = Record<string, string | undefined>;
export type GmailTransport = "replit" | "direct";

type GmailCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export function gmailTransport(env: Environment = process.env): GmailTransport | null {
  const value = env.GMAIL_TRANSPORT ?? "replit";
  return value === "replit" || value === "direct" ? value : null;
}

export function directGmailConfigured(env: Environment = process.env): boolean {
  return Boolean(
    env.GMAIL_CLIENT_ID?.trim()
    && env.GMAIL_CLIENT_SECRET?.trim()
    && env.GMAIL_REFRESH_TOKEN?.trim(),
  );
}

function credentialsFrom(env: Environment): GmailCredentials {
  if (!directGmailConfigured(env)) {
    throw new Error("Direct Gmail needs GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN");
  }
  return {
    clientId: env.GMAIL_CLIENT_ID!.trim(),
    clientSecret: env.GMAIL_CLIENT_SECRET!.trim(),
    refreshToken: env.GMAIL_REFRESH_TOKEN!.trim(),
  };
}

// No credential values, tokens, or raw provider errors leave this adapter.
// Fetch and the clock are injectable so tests cannot send real messages.
export function createDirectGmailSender(
  credentials: GmailCredentials,
  options: { request?: typeof fetch; now?: () => number } = {},
) {
  if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
    throw new Error("Direct Gmail credentials are incomplete");
  }
  const request = options.request ?? fetch;
  const now = options.now ?? Date.now;
  let cached: { token: string; refreshAt: number } | undefined;
  let refreshing: Promise<string> | undefined;

  async function refresh(): Promise<string> {
    let response: Response;
    try {
      response = await request("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          refresh_token: credentials.refreshToken,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error("Gmail authorization request timed out or failed");
    }
    const data = await response.json().catch(() => null) as {
      error?: unknown; access_token?: unknown; expires_in?: unknown; token_type?: unknown;
    } | null;
    if (!response.ok) {
      if (data?.error === "invalid_grant") {
        throw new Error("Gmail authorization expired or was revoked; authorize the mailbox again");
      }
      if (data?.error === "invalid_client" || data?.error === "unauthorized_client") {
        throw new Error("Google rejected the Gmail OAuth client configuration");
      }
      throw new Error(`Gmail authorization failed (HTTP ${response.status})`);
    }
    if (typeof data?.access_token !== "string" || !data.access_token
      || typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in)
      || data.expires_in <= 0
      || (data.token_type !== undefined && (
        typeof data.token_type !== "string" || data.token_type.toLowerCase() !== "bearer"
      ))) {
      throw new Error("Google returned an invalid Gmail authorization response");
    }
    const lifetime = data.expires_in * 1000;
    cached = {
      token: data.access_token,
      refreshAt: now() + lifetime - Math.min(60_000, lifetime / 2),
    };
    return cached.token;
  }

  async function accessToken(): Promise<string> {
    if (cached && now() < cached.refreshAt) return cached.token;
    // Concurrent customer receipts and owner alerts share one token refresh.
    if (!refreshing) refreshing = refresh().finally(() => { refreshing = undefined; });
    return refreshing;
  }

  return {
    async send(raw: string): Promise<void> {
      if (!/^[A-Za-z0-9_-]+$/.test(raw)) {
        throw new Error("Gmail requires a base64url-encoded message");
      }
      const token = await accessToken();
      let response: Response;
      try {
        response = await request("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        // A lost response may follow a successful send. Never retry this write.
        throw new Error("Gmail send response was lost or timed out; delivery is uncertain and was not retried");
      }
      await response.body?.cancel().catch(() => {});
      if (!response.ok) {
        if (response.status === 401 && cached?.token === token) cached = undefined;
        if (response.status === 403) {
          throw new Error("Gmail send was rejected (HTTP 403); check sending permission and mailbox limits");
        }
        throw new Error(`Gmail send failed (HTTP ${response.status}); the message was not retried`);
      }
    },
  };
}

let active: {
  credentials: GmailCredentials;
  sender: ReturnType<typeof createDirectGmailSender>;
} | undefined;

export async function sendDirectGmail(raw: string): Promise<void> {
  const credentials = credentialsFrom(process.env);
  if (!active || active.credentials.clientId !== credentials.clientId
    || active.credentials.clientSecret !== credentials.clientSecret
    || active.credentials.refreshToken !== credentials.refreshToken) {
    active = { credentials, sender: createDirectGmailSender(credentials) };
  }
  await active.sender.send(raw);
}