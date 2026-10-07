import { Router, type Request } from "express";
import { GetAuthSessionResponse } from "@workspace/api-zod";
import {
  createGoogleFlow, currentGoogleIdentity, googleAuthorizationUrl, googleConfig,
  isGoogleAdmin, SESSION_COOKIE, SESSION_IDLE_MAX_AGE, validGoogleFlow,
  type GoogleConfig, type GoogleFlow, type GoogleIdentity,
} from "../auth/google-policy";
import { exchangeGoogleIdentity } from "../auth/google-provider";
import { rateLimit } from "express-rate-limit";

type AuthServices = {
  config: () => GoogleConfig | null;
  exchange: (config: GoogleConfig, flow: GoogleFlow, code: string) => Promise<GoogleIdentity>;
};
const save = (req: Request) => new Promise<void>((resolve, reject) =>
  req.session.save((error) => error ? reject(error) : resolve()));
const regenerate = (req: Request) => new Promise<void>((resolve, reject) =>
  req.session.regenerate((error) => error ? reject(error) : resolve()));

// Dependencies can be supplied by isolated tests; the live router always uses Google's verifier.
export function createGoogleAuthRouter(services: AuthServices = {
  config: googleConfig, exchange: exchangeGoogleIdentity,
}) {
  const router = Router();
  router.use("/auth", (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  router.get("/auth/session", (req, res) => {
    const user = currentGoogleIdentity(req.session.googleUser);
    res.json(GetAuthSessionResponse.parse({
      configured: Boolean(services.config()),
      user: user ? {
        id: user.id, email: user.email, name: user.name, firstName: user.firstName,
        isAdmin: isGoogleAdmin(user),
      } : null,
    }));
  });

  const startLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, limit: 20,
    standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Please wait a few minutes." },
  });
  router.get("/auth/google/start", startLimiter, async (req, res): Promise<void> => {
    const config = services.config();
    if (!config) {
      res.status(503).json({ error: "Google sign-in is not configured yet." });
      return;
    }
    if (`${req.protocol}://${req.get("host")}` !== config.origin) {
      // Start and callback must share one host-only session cookie.
      res.redirect(302, `${config.origin}/api/auth/google/start`);
      return;
    }
    req.session.googleFlow = createGoogleFlow();
    try {
      await save(req);
      res.redirect(302, googleAuthorizationUrl(config, req.session.googleFlow));
    } catch {
      req.log?.error("Could not save Google sign-in state");
      res.redirect(302, "/client/sign-in?error=session_failed");
    }
  });

  router.get("/auth/google/callback", async (req, res): Promise<void> => {
    const flow = req.session.googleFlow;
    // No returnTo parameter or request-host derived redirect: prevent open redirects.
    const fail = (error: string) => res.redirect(302, `/client/sign-in?error=${error}`);
    if (!validGoogleFlow(flow, req.query.state)) { fail("expired"); return; }
    delete req.session.googleFlow;
    try {
      // Consume the state before talking to Google.
      await save(req);
      if (req.query.error) { fail("cancelled"); return; }
      const config = services.config();
      if (!config) { fail("unavailable"); return; }
      if (typeof req.query.code !== "string" || !req.query.code || req.query.code.length > 4096) {
        fail("google_failed"); return;
      }
      const identity = await services.exchange(config, flow, req.query.code);
      if (!currentGoogleIdentity(identity)) { fail("unverified_email"); return; }
      // Never attach an identity to the pre-login session ID.
      await regenerate(req);
      req.session.googleUser = identity;
      req.session.cookie.maxAge = SESSION_IDLE_MAX_AGE;
      await save(req);
      res.redirect(302, "/client/account");
    } catch {
      // Google errors can contain OAuth codes/tokens. Never log the raw exception.
      req.log?.warn("Google sign-in could not be completed");
      fail("google_failed");
    }
  });

  router.post("/auth/logout", async (req, res): Promise<void> => {
    const config = services.config();
    // Require the browser's exact Origin. Forwarded/request host cannot expand this allow-list.
    if (!config || req.get("origin") !== config.origin) {
      res.status(403).json({ error: "A same-origin sign-out request is required." });
      return;
    }
    try {
      await new Promise<void>((resolve, reject) =>
        req.session.destroy((error) => error ? reject(error) : resolve()));
      res.clearCookie(SESSION_COOKIE, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
      });
      res.status(204).end();
    } catch {
      req.log?.error("Could not destroy Google login session");
      res.status(500).json({ error: "Could not sign out. Please try again." });
    }
  });
  return router;
}

export default createGoogleAuthRouter();
