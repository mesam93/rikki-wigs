import { directCalendarConfigured } from "./calendar-config";

type Credentials = { clientId: string; clientSecret: string; refreshToken: string };
type RequestOptions = { method?: string; body?: string };

// This client has no database access. Tests inject HTTP; production endpoints
// are fixed Google HTTPS URLs, and credentials/errors are never logged.
export function createDirectCalendarClient(
  credentials: Credentials,
  options: { request?: typeof fetch; now?: () => number } = {},
) {
  if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
    throw new Error("Direct Calendar credentials are incomplete");
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
          grant_type: "refresh_token", client_id: credentials.clientId,
          client_secret: credentials.clientSecret, refresh_token: credentials.refreshToken,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error("Calendar authorization request timed out or failed");
    }
    const data = await response.json().catch(() => null) as {
      error?: unknown; access_token?: unknown; expires_in?: unknown; token_type?: unknown;
    } | null;
    if (!response.ok) {
      if (data?.error === "invalid_grant") {
        throw new Error("Calendar authorization expired or was revoked; authorize the owner calendar again");
      }
      if (data?.error === "invalid_client" || data?.error === "unauthorized_client") {
        throw new Error("Google rejected the Calendar OAuth client configuration");
      }
      throw new Error(`Calendar authorization failed (HTTP ${response.status})`);
    }
    if (typeof data?.access_token !== "string" || !data.access_token
      || typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in) || data.expires_in <= 0
      || (data.token_type !== undefined && (
        typeof data.token_type !== "string" || data.token_type.toLowerCase() !== "bearer"
      ))) throw new Error("Google returned an invalid Calendar authorization response");
    const lifetime = data.expires_in * 1000;
    cached = { token: data.access_token, refreshAt: now() + lifetime - Math.min(60_000, lifetime / 2) };
    return cached.token;
  }

  async function accessToken(): Promise<string> {
    if (cached && now() < cached.refreshAt) return cached.token;
    if (!refreshing) refreshing = refresh().finally(() => { refreshing = undefined; });
    return refreshing;
  }

  return {
    async request(path: string, init: RequestOptions = {}): Promise<Response> {
      if ((!path.startsWith("/calendars/") && !/^\/users\/me\/calendarList(?:\?|$)/.test(path))
        || path.includes("\\") || /[\r\n]/.test(path)) {
        throw new Error("Invalid Calendar API path");
      }
      const token = await accessToken();
      let response: Response;
      try {
        response = await request(`https://www.googleapis.com/calendar/v3${path}`, {
          ...init,
          headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        // Reconciliation retries fixed-ID operations; the transport never
        // retries a write or invents a new event ID after an uncertain response.
        throw new Error("Calendar request timed out or failed; no transport retry was made");
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        if (response.status === 401 && cached?.token === token) cached = undefined;
        const error = new Error(`Google Calendar request failed (HTTP ${response.status})`);
        Object.assign(error, { status: response.status });
        throw error;
      }
      return response;
    },
  };
}

let active: { credentials: Credentials; client: ReturnType<typeof createDirectCalendarClient> } | undefined;

export async function directCalendarRequest(path: string, init?: RequestOptions): Promise<Response> {
  if (!directCalendarConfigured()) {
    throw new Error("Direct Calendar needs CALENDAR_CLIENT_ID, CALENDAR_CLIENT_SECRET, and CALENDAR_REFRESH_TOKEN");
  }
  const credentials = {
    clientId: process.env.CALENDAR_CLIENT_ID!.trim(),
    clientSecret: process.env.CALENDAR_CLIENT_SECRET!.trim(),
    refreshToken: process.env.CALENDAR_REFRESH_TOKEN!.trim(),
  };
  if (!active || Object.keys(credentials).some(key =>
    credentials[key as keyof Credentials] !== active!.credentials[key as keyof Credentials])) {
    active = { credentials, client: createDirectCalendarClient(credentials) };
  }
  return active.client.request(path, init);
}