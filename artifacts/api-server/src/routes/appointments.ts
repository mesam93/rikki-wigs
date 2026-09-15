import { Router, type IRouter } from "express";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { appointmentsTable, db, type Appointment } from "@workspace/db";
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

const router: IRouter = Router();

function serializeAppointment(appointment: Appointment) {
  return {
    ...appointment,
    createdAt: appointment.createdAt.toISOString(),
  };
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

router.get("/appointments", async (req, res): Promise<void> => {
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

router.post("/appointments", async (req, res): Promise<void> => {
  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid appointment");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select({ id: appointmentsTable.id })
    .from(appointmentsTable)
    .where(
      and(
        eq(
          appointmentsTable.appointmentDate,
          toDateString(parsed.data.appointmentDate),
        ),
        eq(appointmentsTable.appointmentTime, parsed.data.appointmentTime),
        inArray(appointmentsTable.status, ["pending", "confirmed"]),
      ),
    );

  if (existing.length > 0) {
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

  res
    .status(201)
    .json(CreateAppointmentResponse.parse(serializeAppointment(appointment)));
});

router.patch("/appointments/:id", async (req, res): Promise<void> => {
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

  res.json(
    UpdateAppointmentResponse.parse(serializeAppointment(appointment)),
  );
});

router.delete("/appointments/:id", async (req, res): Promise<void> => {
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

router.get("/appointments/summary", async (_req, res): Promise<void> => {
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

router.get("/availability", async (_req, res): Promise<void> => {
  const today = new Date();
  const lastDay = new Date(today);
  lastDay.setUTCDate(lastDay.getUTCDate() + 21);
  const start = today.toISOString().slice(0, 10);
  const end = lastDay.toISOString().slice(0, 10);

  const booked = await db
    .select({
      date: appointmentsTable.appointmentDate,
      time: appointmentsTable.appointmentTime,
    })
    .from(appointmentsTable)
    .where(
      and(
        gte(appointmentsTable.appointmentDate, start),
        inArray(appointmentsTable.status, ["pending", "confirmed"]),
      ),
    );

  const bookedSlots = new Set(
    booked.map((slot) => `${slot.date}:${slot.time}`),
  );
  const baseTimes = ["10:00 AM", "11:30 AM", "1:00 PM", "2:30 PM", "4:00 PM"];
  const availability = [];

  for (let offset = 1; offset <= 21; offset += 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() + offset);
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const date = day.toISOString().slice(0, 10);
    if (date > end) break;
    const times = baseTimes.filter(
      (time) => !bookedSlots.has(`${date}:${time}`),
    );
    if (times.length > 0) availability.push({ date, times });
  }

  res.json(GetAvailabilityResponse.parse(availability));
});

export default router;