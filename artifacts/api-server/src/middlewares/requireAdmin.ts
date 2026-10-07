import type { RequestHandler } from "express";
import { currentGoogleIdentity, googleConfig, isGoogleAdmin } from "../auth/google-policy";

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const user = currentGoogleIdentity(req.session?.googleUser);
  if (!user) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    req.log.error("Admin email is not configured");
    res.status(503).json({ error: "Admin access is not configured" });
    return;
  }

  if (!isGoogleAdmin(user, adminEmail)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const origin = googleConfig()?.origin;
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)
    && (!origin || req.get("origin") !== origin)) {
    res.status(403).json({ error: "A same-origin request is required." });
    return;
  }

  next();
};