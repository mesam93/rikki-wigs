import { Router, type IRouter } from "express";
import healthRouter from "./health";
import appointmentsRouter from "./appointments";
import siteContentRouter from "./site-content";
import servicesRouter from "./services";
import wigOrdersRouter from "./wig-orders";
import { requireAdmin } from "../middlewares/requireAdmin";
import calendarSyncRouter from "./calendar-sync";
import clientRouter from "./client";
import googleAuthRouter from "./google-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(googleAuthRouter);
router.get("/admin-session", requireAdmin, (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ role: "admin" });
});
router.use(siteContentRouter);
router.use(servicesRouter);
router.use(appointmentsRouter);
router.use(wigOrdersRouter);
router.use(calendarSyncRouter);
router.use(clientRouter);
export default router;
