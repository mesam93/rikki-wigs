import { Router, type IRouter } from "express";
import healthRouter from "./health";
import appointmentsRouter from "./appointments";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

router.use(healthRouter);
router.get("/admin-session", requireAdmin, (_req, res) => {
  res.json({ role: "admin" });
});
router.use(appointmentsRouter);

export default router;
