import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    req.log.error("Admin email is not configured");
    res.status(503).json({ error: "Admin access is not configured" });
    return;
  }

  const user = await clerkClient.users.getUser(userId);
  const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
  const verifiedAdminEmail = primary?.verification?.status === "verified"
    && primary.emailAddress.trim().toLowerCase() === adminEmail;
  const linkedGoogleAccount = user.externalAccounts.some((account) =>
    account.provider === "oauth_google" && account.emailAddress?.trim().toLowerCase() === adminEmail
  );
  if (!verifiedAdminEmail || !linkedGoogleAccount) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  next();
};