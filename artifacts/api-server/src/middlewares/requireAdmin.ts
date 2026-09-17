import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const isAdmin = user.publicMetadata.role === "admin";

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