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
    req.log.error("ADMIN_EMAIL is not configured");
    res.status(503).json({ error: "Admin access is not configured" });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const primaryEmail = user.emailAddresses.find(
      ({ id }) => id === user.primaryEmailAddressId,
    );
    const isAdmin =
      primaryEmail?.emailAddress.toLowerCase() === adminEmail &&
      primaryEmail.verification?.status === "verified";

    if (!isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    next();
  } catch (error) {
    req.log.error({ err: error, userId }, "Could not verify admin access");
    res.status(503).json({ error: "Could not verify admin access" });
  }
};