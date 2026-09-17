import type { RequestHandler } from "express";

export const ADMIN_SESSION_COOKIE = "rikki_admin_session";

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.signedCookies?.[ADMIN_SESSION_COOKIE] !== "authenticated") {
    res.status(401).json({ error: "Sign in required" });
    return;
  }

  next();
};