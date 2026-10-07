import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { validClientEmail } from "../lib/verified-email";

export const FLOW_MAX_AGE = 10 * 60 * 1000;
export const SESSION_IDLE_MAX_AGE = 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MAX_AGE = 7 * SESSION_IDLE_MAX_AGE;
export const SESSION_COOKIE = "rikki_google_session";

export type GoogleIdentity = {
  id: string;
  email: string;
  name: string;
  firstName: string;
  googleVerified: true;
  authenticatedAt: number;
};
export type GoogleFlow = { state: string; nonce: string; verifier: string; createdAt: number };
export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string; origin: string };

declare module "express-session" {
  interface SessionData {
    googleUser?: GoogleIdentity;
    googleFlow?: GoogleFlow;
  }
}

export function googleConfig(env = process.env): GoogleConfig | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  try {
    const url = new URL(redirectUri);
    const localDevelopment = env.NODE_ENV !== "production"
      && ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:"))
      || url.pathname !== "/api/auth/google/callback"
      || url.search || url.hash || url.username || url.password) return null;
    return { clientId, clientSecret, redirectUri, origin: url.origin };
  } catch {
    return null;
  }
}

export function createGoogleFlow(now = Date.now()): GoogleFlow {
  return {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    createdAt: now,
  };
}

export function securelyEqual(actual: unknown, expected: string): boolean {
  if (typeof actual !== "string") return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function validGoogleFlow(flow: GoogleFlow | undefined, state: unknown, now = Date.now()): flow is GoogleFlow {
  return Boolean(flow && now >= flow.createdAt && now - flow.createdAt <= FLOW_MAX_AGE
    && securelyEqual(state, flow.state));
}

export function googleAuthorizationUrl(config: GoogleConfig, flow: GoogleFlow): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

// Called only after Google's SDK has verified signature, issuer, audience and expiry.
export function identityFromVerifiedPayload(
  payload: { sub?: string; email?: string; email_verified?: boolean; name?: string; given_name?: string; nonce?: string },
  nonce: string,
  now = Date.now(),
): GoogleIdentity {
  const email = validClientEmail(payload.email ?? "");
  if (!payload.sub || !email || payload.email_verified !== true || !securelyEqual(payload.nonce, nonce)) {
    throw new Error("Google identity was not verified");
  }
  return {
    id: payload.sub,
    email,
    name: payload.name ?? "",
    firstName: payload.given_name ?? "",
    googleVerified: true,
    authenticatedAt: now,
  };
}

export function currentGoogleIdentity(identity: GoogleIdentity | undefined, now = Date.now()): GoogleIdentity | null {
  if (!identity || identity.googleVerified !== true || typeof identity.email !== "string" || !validClientEmail(identity.email)
    || !identity.id || !Number.isFinite(identity.authenticatedAt)
    || now < identity.authenticatedAt
    || now - identity.authenticatedAt >= SESSION_ABSOLUTE_MAX_AGE) return null;
  return identity;
}

export function isGoogleAdmin(identity: GoogleIdentity | null, adminEmail = process.env.ADMIN_EMAIL): boolean {
  return Boolean(identity && adminEmail?.trim()
    && identity.email === adminEmail.trim().toLowerCase());
}
