import { Router, type IRouter } from "express";
import { SelectCalendarSyncDestinationBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";
import { calendarSyncHealth, retryCalendarSync, setCalendar } from "../lib/calendar-sync";
import { calendarConfig } from "../lib/calendar-config";

const router: IRouter = Router();
router.use("/calendar-sync", requireAdmin);

router.get("/calendar-sync", async (_req, res): Promise<void> => {
  res.json(await calendarSyncHealth());
});

router.put("/calendar-sync", async (req, res): Promise<void> => {
  const parsed = SelectCalendarSyncDestinationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a calendar." });
    return;
  }
  try {
    await setCalendar(parsed.data.calendarId);
    res.json(await calendarSyncHealth());
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Calendar unavailable" });
  }
});

router.post("/calendar-sync/retry", async (req, res): Promise<void> => {
  const config = calendarConfig();
  if (!config.enabled) {
    res.status(409).json({ error: config.disabledReason });
    return;
  }
  const result = await retryCalendarSync();
  req.log.info(result, "Calendar sync retry completed");
  res.json(result);
});

export default router;