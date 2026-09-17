import { Router, type IRouter, type Request } from "express";
import { and, asc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { appointmentsTable, db, schedulingSettingsTable, type Appointment, type BlockedSlot, type TimeWindow, type WeeklyHours } from "@workspace/db";
import {
  CreateAppointmentBody,
  CreateAppointmentResponse,
  DeleteAppointmentParams,
  GetAppointmentSummaryResponse,
  GetAvailabilityResponse,
  ListAppointmentsQueryParams,
  ListAppointmentsResponse,
  UpdateAppointmentBody,
  UpdateAppointmentParams,
  UpdateAppointmentResponse,
} from "@workspace/api-zod";
import {
  getEmailDeliveryStatus,
  notificationEventForUpdate,
  sendAppointmentNotification,
} from "../email/appointment-emails";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

async function deliverAppointmentEmail(
  req: Request,
  event: Parameters<typeof sendAppointmentNotification>[0],
  appointment: Appointment,
) {
  try {
    const result = await sendAppointmentNotification(event, appointment);
    const details = {
      appointmentId: appointment.id,
      eventType: result.eventType,
      outcome: result.outcome,
      error: result.error,
    };
    if (result.outcome === "failed") {
      req.log.error(details, "Appointment email delivery failed");
    } else {
      req.log.info(details, "Appointment email processed");
    }
  } catch (error) {
    req.log.error(
      {
        appointmentId: appointment.id,
        eventType: event,
        error: error instanceof Error ? error.message : "Unknown notification error",
      },
      "Appointment saved but its email notification could not be recorded",
    );
  }
}

function serializeAppointment(appointment: Appointment) {
  return {
    ...appointment,
    createdAt: appointment.createdAt.toISOString(),
  };
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const defaultDurations: Record<string, number> = {
  "Lace wig consultation": 60,
  "Skin top wig consultation": 60,
  "Custom color": 120,
  Styling: 60,
  Repair: 60,
};
const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const defaultDayWindows = Object.fromEntries(weekdays.map((day) => [day, day === "sunday" || day === "saturday" ? [] : [{ id: `${day}-1`, start: "10:00", end: day === "friday" ? "15:00" : "17:00" }]])) as Record<string, TimeWindow[]>;
const defaultWeeklyHours: WeeklyHours = Object.fromEntries(Object.keys(defaultDurations).map((service) => [service, structuredClone(defaultDayWindows)]));
const defaultSettings = { id: 1, serviceDurations: defaultDurations, weeklyHours: defaultWeeklyHours, blockedSlots: [] as BlockedSlot[] };

async function getSettings() {
  const [settings] = await db.select().from(schedulingSettingsTable).where(eq(schedulingSettingsTable.id, 1));
  if (!settings) return defaultSettings;
  const firstValue = Object.values(settings.weeklyHours ?? {})[0];
  if (firstValue && typeof firstValue === "object" && "open" in firstValue) {
    const legacy = settings.weeklyHours as unknown as Record<string, { open: string; close: string; closed: boolean }>;
    const migrated = Object.fromEntries(Object.keys(defaultDurations).map((service) => [service, Object.fromEntries(weekdays.map((day) => {
      const value = legacy[day];
      return [day, !value || value.closed ? [] : [{ id: `${day}-1`, start: value.open, end: value.close }]];
    }))])) as WeeklyHours;
    return { ...settings, weeklyHours: migrated };
  }
  return settings;
}

function toMinutes(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return 0;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function toDisplayTime(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours = hours24 % 12 || 12;
  return `${hours}:${String(mins).padStart(2, "0")} ${period}`;
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

router.get("/appointments", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListAppointmentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const query = db.select().from(appointmentsTable);
  const appointments = parsed.data.status
    ? await query
        .where(eq(appointmentsTable.status, parsed.data.status))
        .orderBy(
          asc(appointmentsTable.appointmentDate),
          asc(appointmentsTable.appointmentTime),
        )
    : await query.orderBy(
        asc(appointmentsTable.appointmentDate),
        asc(appointmentsTable.appointmentTime),
      );

  res.json(
    ListAppointmentsResponse.parse(appointments.map(serializeAppointment)),
  );
});

router.get("/email-status", requireAdmin, (_req, res): void => {
  res.json(getEmailDeliveryStatus());
});

router.post("/appointments", async (req, res): Promise<void> => {
  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid appointment");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const settings = await getSettings();
  const requestedStart = toMinutes(parsed.data.appointmentTime);
  const requestedEnd = requestedStart + (settings.serviceDurations[parsed.data.service] ?? 60);
  const existing = await db
    .select({ time: appointmentsTable.appointmentTime, service: appointmentsTable.service })
    .from(appointmentsTable)
    .where(
      and(
        eq(
          appointmentsTable.appointmentDate,
          toDateString(parsed.data.appointmentDate),
        ),
        inArray(appointmentsTable.status, ["pending", "confirmed"]),
      ),
    );

  if (existing.some((item) => {
    const start = toMinutes(item.time);
    return overlaps(requestedStart, requestedEnd, start, start + (settings.serviceDurations[item.service] ?? 60));
  })) {
    res.status(409).json({ error: "That time was just booked. Please choose another." });
    return;
  }

  const [appointment] = await db
    .insert(appointmentsTable)
    .values({
      ...parsed.data,
      appointmentDate: toDateString(parsed.data.appointmentDate),
      notes: parsed.data.notes ?? "",
    })
    .returning();

  await deliverAppointmentEmail(req, "request_received", appointment);

  res
    .status(201)
    .json(CreateAppointmentResponse.parse(serializeAppointment(appointment)));
});

router.patch("/appointments/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAppointmentParams.safeParse(req.params);
  const body = UpdateAppointmentBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [current] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  const nextDate = body.data.appointmentDate ? toDateString(body.data.appointmentDate) : current.appointmentDate;
  const nextTime = body.data.appointmentTime ?? current.appointmentTime;
  const nextStatus = body.data.status ?? current.status;
  if (nextStatus === "pending" || nextStatus === "confirmed") {
    const settings = await getSettings();
    const start = toMinutes(nextTime);
    const end = start + (settings.serviceDurations[current.service] ?? 60);
    const conflicts = await db.select({ time: appointmentsTable.appointmentTime, service: appointmentsTable.service })
      .from(appointmentsTable)
      .where(and(
        ne(appointmentsTable.id, current.id),
        eq(appointmentsTable.appointmentDate, nextDate),
        inArray(appointmentsTable.status, ["pending", "confirmed"]),
      ));
    if (conflicts.some((item) => {
      const otherStart = toMinutes(item.time);
      return overlaps(start, end, otherStart, otherStart + (settings.serviceDurations[item.service] ?? 60));
    })) {
      res.status(409).json({ error: "That time overlaps another active appointment." });
      return;
    }
  }

  const { appointmentDate, ...otherUpdates } = body.data;
  const update = appointmentDate
    ? { ...otherUpdates, appointmentDate: toDateString(appointmentDate) }
    : otherUpdates;

  const [appointment] = await db
    .update(appointmentsTable)
    .set(update)
    .where(eq(appointmentsTable.id, params.data.id))
    .returning();

  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const emailEvent = notificationEventForUpdate(current, appointment);
  if (emailEvent) {
    await deliverAppointmentEmail(req, emailEvent, appointment);
  }

  res.json(
    UpdateAppointmentResponse.parse(serializeAppointment(appointment)),
  );
});

router.delete("/appointments/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [appointment] = await db
    .delete(appointmentsTable)
    .where(eq(appointmentsTable.id, params.data.id))
    .returning({ id: appointmentsTable.id });

  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/appointments/summary", requireAdmin, async (_req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${appointmentsTable.status} = 'pending')::int`,
      confirmed: sql<number>`count(*) filter (where ${appointmentsTable.status} = 'confirmed')::int`,
      completed: sql<number>`count(*) filter (where ${appointmentsTable.status} = 'completed')::int`,
      cancelled: sql<number>`count(*) filter (where ${appointmentsTable.status} = 'cancelled')::int`,
      upcoming: sql<number>`count(*) filter (where ${appointmentsTable.appointmentDate} >= ${today} and ${appointmentsTable.status} in ('pending', 'confirmed'))::int`,
    })
    .from(appointmentsTable);

  res.json(
    GetAppointmentSummaryResponse.parse(
      counts ?? {
        total: 0,
        pending: 0,
        confirmed: 0,
        completed: 0,
        cancelled: 0,
        upcoming: 0,
      },
    ),
  );
});

router.get("/scheduling-settings", requireAdmin, async (_req, res): Promise<void> => {
  res.json(await getSettings());
});

router.put("/scheduling-settings", requireAdmin, async (req, res): Promise<void> => {
  const serviceDurations = req.body?.serviceDurations;
  const weeklyHours = req.body?.weeklyHours;
  const blockedSlots = req.body?.blockedSlots;
  if (!serviceDurations || !weeklyHours || !Array.isArray(blockedSlots)) {
    res.status(400).json({ error: "Invalid scheduling settings" });
    return;
  }
  const [settings] = await db.insert(schedulingSettingsTable).values({
    id: 1,
    serviceDurations,
    weeklyHours,
    blockedSlots,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: schedulingSettingsTable.id,
    set: { serviceDurations, weeklyHours, blockedSlots, updatedAt: new Date() },
  }).returning();
  res.json(settings);
});

router.get("/availability", async (req, res): Promise<void> => {
  const settings = await getSettings();
  const service = typeof req.query.service === "string" ? req.query.service : "Lace wig consultation";
  const requestedDuration = settings.serviceDurations[service] ?? 60;
  const today = new Date();
  const lastDay = new Date(today);
  lastDay.setUTCDate(lastDay.getUTCDate() + 180);
  const start = today.toISOString().slice(0, 10);
  const end = lastDay.toISOString().slice(0, 10);

  const booked = await db
    .select({
      date: appointmentsTable.appointmentDate,
      time: appointmentsTable.appointmentTime,
      service: appointmentsTable.service,
    })
    .from(appointmentsTable)
    .where(
      and(
        gte(appointmentsTable.appointmentDate, start),
        inArray(appointmentsTable.status, ["pending", "confirmed"]),
      ),
    );

  const availability = [];
  for (let offset = 1; offset <= 180; offset += 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() + offset);
    const weekday = weekdays[day.getUTCDay()];
    const windows = settings.weeklyHours[service]?.[weekday] ?? [];
    if (!windows.length) continue;
    const date = day.toISOString().slice(0, 10);
    if (date > end) break;
    const dayBookings = booked.filter((slot) => slot.date === date);
    const dayBlocks = settings.blockedSlots.filter((slot) => slot.date === date);
    const times: string[] = [];
    for (const window of windows) {
      const open = toMinutes(window.start);
      const close = toMinutes(window.end);
      for (let startTime = open; startTime + requestedDuration <= close; startTime += 30) {
        const endTime = startTime + requestedDuration;
        const conflictsWithBooking = dayBookings.some((slot) => {
          const bookedStart = toMinutes(slot.time);
          const bookedDuration = settings.serviceDurations[slot.service] ?? 60;
          return overlaps(startTime, endTime, bookedStart, bookedStart + bookedDuration);
        });
        const conflictsWithBlock = dayBlocks.some((slot) =>
          overlaps(startTime, endTime, toMinutes(slot.startTime), toMinutes(slot.endTime)),
        );
        const display = toDisplayTime(startTime);
        if (!conflictsWithBooking && !conflictsWithBlock && !times.includes(display)) times.push(display);
      }
    }
    if (times.length > 0) availability.push({ date, times });
  }

  res.json(GetAvailabilityResponse.parse(availability));
});

export default router;