import { Router, type IRouter } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import healthRouter from "./health";
import appointmentsRouter from "./appointments";
import siteContentRouter from "./site-content";
import servicesRouter from "./services";
import wigOrdersRouter from "./wig-orders";
import {
  ADMIN_SESSION_COOKIE,
  requireAdmin,
} from "../middlewares/requireAdmin";
import calendarSyncRouter from "./calendar-sync";

const router: IRouter = Router();

router.use(healthRouter);
router.post("/admin-login", (req, res) => {
  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const configuredPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const submittedEmail =
    typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const submittedPassword =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!configuredEmail || !configuredPassword) {
    req.log.error("Admin credentials are not configured");
    res.status(503).json({ error: "Admin login is not configured" });
    return;
  }

  const passwordMatches = timingSafeEqual(
    createHash("sha256").update(submittedPassword).digest(),
    createHash("sha256").update(configuredPassword).digest(),
  );
  if (submittedEmail !== configuredEmail || !passwordMatches) {
    res.status(401).json({ error: "Incorrect email or password" });
    return;
  }

  res.cookie(ADMIN_SESSION_COOKIE, "authenticated", {
    signed: true,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  });
  res.json({ role: "admin" });
});

router.post("/admin-logout", (_req, res) => {
  res.clearCookie(ADMIN_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  res.sendStatus(204);
});

router.get("/admin-session", requireAdmin, (_req, res) => {
  res.json({ role: "admin" });
});
router.use(siteContentRouter);
router.use(servicesRouter);
router.use(appointmentsRouter);
router.use(wigOrdersRouter);
router.use(calendarSyncRouter);
export default router;
