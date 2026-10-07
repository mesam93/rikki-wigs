import { OAuth2Client } from "google-auth-library";
import { identityFromVerifiedPayload, type GoogleConfig, type GoogleFlow, type GoogleIdentity } from "./google-policy";

export async function exchangeGoogleIdentity(
  config: GoogleConfig, flow: GoogleFlow, code: string,
): Promise<GoogleIdentity> {
  const client = new OAuth2Client({
    clientId: config.clientId, clientSecret: config.clientSecret,
    redirectUri: config.redirectUri, transporterOptions: { timeout: 15_000 },
  });
  const { tokens } = await client.getToken({
    code, codeVerifier: flow.verifier, redirect_uri: config.redirectUri,
  });
  if (!tokens.id_token) throw new Error("Google did not return an identity token");
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("Google identity payload is missing");
  // Access/refresh tokens are deliberately not persisted. Login needs no mailbox or calendar access.
  return identityFromVerifiedPayload(payload as typeof payload & { nonce?: string }, flow.nonce);
}
