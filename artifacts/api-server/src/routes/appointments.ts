import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { appointmentCalendarSyncTable, appointmentsTable, db, schedulingSettingsTable, type Appointment, type BlockedSlot, type TimeWindow, type WeeklyHours } from "@workspace/db";
import {
  CreateAdminAppointmentBody,
  CreateAdminAppointmentResponse,
  CreateAppointmentBody,
  CreateAppointmentResponse,
  DeleteAppointmentParams,
  GetAppointmentSummaryResponse,
  GetAdminAvailabilityResponse,
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
import { ensureServices, getBookableService, weekdays } from "../lib/services";
import { trySyncAppointment } from "../lib/calendar-sync";
import { availableStarts, toMinutes } from "../lib/availability-slots";
import { ensureClient, validClientEmail } from "../lib/client-identity";

const router: IRouter = Router();

async function deliverAppointmentEmail(
  req: Request,
  event: Parameters<typeof sendAppointmentNotification>[0],
  appointment: Appointment,
): Promise<Awaited<ReturnType<typeof sendAppointmentNotification>>> {
  try {
    const result = await sendAppointmentNotification(event, appointment);
    const details = {
      appointmentId: appointment.id,
      eventType: result.eventType,
      outcome: result.outcome,
      error: result.error,
      recordError: result.recordError,
    };
    if (result.recordError) {
      req.log.error(details, "Appointment email outcome could not be recorded");
    } else if (result.outcome === "failed") {
      req.log.error(details, "Appointment email delivery failed");
    } else {
      req.log.info(details, "Appointment email processed");
    }
    return result;
  } catch (error) {
    req.log.error(
      {
        appointmentId: appointment.id,
        eventType: event,
        error: error instanceof Error ? error.message : "Unknown notification error",
      },
      "Appointment saved but its email notification could not be recorded",
    );
    return {
      outcome: "failed",
      eventType: event,
      error: error instanceof Error ? error.message : "Notification could not be recorded",
    };
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

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function businessNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

async function reserveAppointment(
  data: ReturnType<typeof CreateAppointmentBody.parse>,
  asAdmin: boolean,
): Promise<{ appointment: Appointment } | { status: 400 | 409; error: string }> {
  const email = validClientEmail(data.email);
  if (!email) return { status: 400, error: "Enter a valid email address." };
  const service = await getBookableService(data.service);
  if (!service) return { status: 400, error: "Choose a service that is currently available for booking." };
  const settings = await getSettings();
  const requestedStart = toMinutes(data.appointmentTime);
  const requestedEnd = requestedStart + service.durationMinutes;
  const requestedDate = toDateString(data.appointmentDate);
  const requestedWeekday = weekdays[data.appointmentDate.getUTCDay()];
  const insideServiceHours = (service.weeklyHours[requestedWeekday] ?? []).some((window) =>
    requestedStart >= toMinutes(window.start) && requestedEnd <= toMinutes(window.end)
  );
  const conflictsWithBlock = settings.blockedSlots.some((slot) =>
    slot.date === requestedDate
    && overlaps(requestedStart, requestedEnd, toMinutes(slot.startTime), toMinutes(slot.endTime))
  );
  const now = businessNow();
  const outOfDate = asAdmin
    ? requestedDate < now.date || (requestedDate === now.date && requestedStart <= now.minutes)
    : requestedDate <= toDateString(new Date());
  if (outOfDate || !insideServiceHours || conflictsWithBlock) {
    return { status: 409, error: "That time is not available. Please choose another." };
  }
  const appointment = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${requestedDate}))`);
    const existing = await tx
      .select({ time: appointmentsTable.appointmentTime, durationMinutes: appointmentsTable.serviceDurationMinutes })
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.appointmentDate, requestedDate),
        inArray(appointmentsTable.status, ["pending", "confirmed"]),
      ));
    if (existing.some((item) => {
      const start = toMinutes(item.time);
      return overlaps(requestedStart, requestedEnd, start, start + item.durationMinutes);
    })) return null;

    const [created] = await tx
      .insert(appointmentsTable)
      .values({
        ...data,
        email,
        serviceId: service.id,
        serviceDurationMinutes: service.durationMinutes,
        appointmentDate: requestedDate,
        notes: data.notes ?? "",
        status: asAdmin ? "confirmed" : "pending",
      })
      .returning();
    await ensureClient(tx, email);
    return created;
  });
  if (!appointment) return { status: 409, error: "That time was just booked. Please choose another." };
  return { appointment };
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

  const result = await reserveAppointment(parsed.data, false);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const { appointment } = result;
  await deliverAppointmentEmail(req, "request_received", appointment);
  await deliverAppointmentEmail(req, "owner_new_appointment", appointment);
  await trySyncAppointment(appointment.id);

  res
    .status(201)
    .json(CreateAppointmentResponse.parse(serializeAppointment(appointment)));
});

router.post("/admin/appointments", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await reserveAppointment(parsed.data, true);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const email = await deliverAppointmentEmail(req, "confirmed", result.appointment);
  const ownerEmail = await deliverAppointmentEmail(req, "owner_new_appointment", result.appointment);
  await trySyncAppointment(result.appointment.id);
  res.status(201).json(CreateAdminAppointmentResponse.parse({
    appointment: serializeAppointment(result.appointment),
    email,
    ownerEmail,
  }));
});

router.patch("/appointments/:id", requireAdmin, async (req, res): Promise<void> => {
  await ensureServices();
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
  const { appointmentDate, ...otherUpdates } = body.data;
  const update = {
    ...otherUpdates,
    ...(appointmentDate ? { appointmentDate: toDateString(appointmentDate) } : {}),
  };

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${nextDate}))`);
    if (nextStatus === "pending" || nextStatus === "confirmed") {
      const start = toMinutes(nextTime);
      const end = start + current.serviceDurationMinutes;
      const conflicts = await tx.select({ time: appointmentsTable.appointmentTime, durationMinutes: appointmentsTable.serviceDurationMinutes })
        .from(appointmentsTable)
        .where(and(
          ne(appointmentsTable.id, current.id),
          eq(appointmentsTable.appointmentDate, nextDate),
          inArray(appointmentsTable.status, ["pending", "confirmed"]),
        ));
      if (conflicts.some((item) => {
        const otherStart = toMinutes(item.time);
        return overlaps(start, end, otherStart, otherStart + item.durationMinutes);
      })) return { conflict: true as const };
    }
    const [appointment] = await tx
      .update(appointmentsTable)
      .set(update)
      .where(eq(appointmentsTable.id, params.data.id))
      .returning();
    if (appointment) await ensureClient(tx, appointment.email);
    return { appointment };
  });
  if ("conflict" in result) {
    res.status(409).json({ error: "That time overlaps another active appointment." });
    return;
  }
  const { appointment } = result;

  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const emailEvent = notificationEventForUpdate(current, appointment);
  if (emailEvent) {
    await deliverAppointmentEmail(req, emailEvent, appointment);
  }
  await trySyncAppointment(appointment.id);

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

  const [appointment] = await db.transaction(async (tx) => {
    const deleted = await tx.delete(appointmentsTable)
      .where(eq(appointmentsTable.id, params.data.id))
      .returning({ id: appointmentsTable.id });
    if (deleted.length) {
      await tx.update(appointmentCalendarSyncTable).set({ deleted: true })
        .where(eq(appointmentCalendarSyncTable.appointmentId, params.data.id));
    }
    return deleted;
  });

  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  await trySyncAppointment(appointment.id);

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
  const blockedSlots = req.body?.blockedSlots;
  if (!Array.isArray(blockedSlots)) {
    res.status(400).json({ error: "Invalid scheduling settings" });
    return;
  }
  const current = await getSettings();
  const [settings] = await db.insert(schedulingSettingsTable).values({
    id: 1,
    serviceDurations: current.serviceDurations,
    weeklyHours: current.weeklyHours,
    blockedSlots,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: schedulingSettingsTable.id,
    set: { blockedSlots, updatedAt: new Date() },
  }).returning();
  res.json(settings);
});

async function sendAvailability(req: Request, res: Response, includeToday: boolean): Promise<void> {
  const settings = await getSettings();
  const serviceName = typeof req.query.service === "string" ? req.query.service : "";
  const service = await getBookableService(serviceName);
  if (!service) {
    res.status(400).json({ error: "Service is not available for booking" });
    return;
  }
  const requestedDuration = service.durationMinutes;
  const now = businessNow();
  const today = includeToday ? new Date(`${now.date}T12:00:00Z`) : new Date();
  const lastDay = new Date(today);
  lastDay.setUTCDate(lastDay.getUTCDate() + 180);
  const start = today.toISOString().slice(0, 10);
  const end = lastDay.toISOString().slice(0, 10);

  const booked = await db
    .select({
      date: appointmentsTable.appointmentDate,
      time: appointmentsTable.appointmentTime,
      durationMinutes: appointmentsTable.serviceDurationMinutes,
    })
    .from(appointmentsTable)
    .where(
      and(
        gte(appointmentsTable.appointmentDate, start),
        inArray(appointmentsTable.status, ["pending", "confirmed"]),
      ),
    );

  const availability = [];
  for (let offset = includeToday ? 0 : 1; offset <= 180; offset += 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() + offset);
    const weekday = weekdays[day.getUTCDay()];
    const windows = service.weeklyHours[weekday] ?? [];
    if (!windows.length) continue;
    const date = day.toISOString().slice(0, 10);
    if (date > end) break;
    const dayBookings = booked.filter((slot) => slot.date === date);
    const dayBlocks = settings.blockedSlots.filter((slot) => slot.date === date);
    const { times, availableStartRanges } = availableStarts(
      windows,
      requestedDuration,
      dayBookings.map((slot) => ({
        start: toMinutes(slot.time),
        end: toMinutes(slot.time) + slot.durationMinutes,
      })),
      dayBlocks.map((slot) => ({
        start: toMinutes(slot.startTime),
        end: toMinutes(slot.endTime),
      })),
      includeToday && date === now.date ? now.minutes + 1 : 0,
    );
    if (availableStartRanges.length) availability.push({ date, times, availableStartRanges });
  }

  res.json((includeToday ? GetAdminAvailabilityResponse : GetAvailabilityResponse).parse(availability));
}

router.get("/availability", async (req, res): Promise<void> => {
  await sendAvailability(req, res, false);
});

router.get("/admin/availability", requireAdmin, async (req, res): Promise<void> => {
  await sendAvailability(req, res, true);
});

export default router;