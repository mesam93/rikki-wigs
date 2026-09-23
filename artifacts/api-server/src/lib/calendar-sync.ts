import { ReplitConnectors } from "@replit/connectors-sdk";
import { and, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import {
  appointmentCalendarSyncTable,
  appointmentsTable,
  calendarSyncSettingsTable,
  db,
  pool,
} from "@workspace/db";
import { logger } from "./logger";
import { eventForAppointment } from "./calendar-time";

const timezone = "America/New_York";
const batchSize = 20;
const connectors = new ReplitConnectors();
type Calendar = { id: string; summary: string; primary?: boolean; accessRole: string };

async function calendarRequest(path: string, init?: { method?: string; body?: string }) {
  const response = await connectors.proxy("google-calendar", `/calendar/v3${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!response.ok) {
    const message = await response.text();
    const error = new Error(`Google Calendar ${response.status}: ${message.slice(0, 300)}`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return response;
}

export async function writableCalendars(): Promise<Calendar[]> {
  const calendars: Calendar[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ fields: "nextPageToken,items(id,summary,primary,accessRole)", maxResults: "250" });
    if (pageToken) query.set("pageToken", pageToken);
    const response = await calendarRequest(`/users/me/calendarList?${query}`);
    const data = await response.json() as { items?: Calendar[]; nextPageToken?: string };
    calendars.push(...(data.items ?? []).filter((item) => item.accessRole === "owner" || item.accessRole === "writer"));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return calendars;
}

export async function selectedCalendar() {
  const [setting] = await db.select().from(calendarSyncSettingsTable).where(eq(calendarSyncSettingsTable.id, 1));
  return setting?.calendarId ?? "primary";
}

export async function setCalendar(calendarId: string) {
  const calendars = await writableCalendars();
  const chosen = calendars.find((item) => item.id === calendarId || (calendarId === "primary" && item.primary));
  if (!chosen) throw new Error("Choose a calendar with permission to create events.");
  await db.insert(calendarSyncSettingsTable).values({ id: 1, calendarId })
    .onConflictDoUpdate({ target: calendarSyncSettingsTable.id, set: { calendarId } });
}

function eventPath(calendarId: string, eventId?: string) {
  return `/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;
}

function statusOf(error: unknown): number | undefined {
  return error instanceof Error ? (error as Error & { status?: number }).status : undefined;
}

export function retryDelayMs(attempts: number) {
  return Math.min(60, 2 ** Math.min(attempts - 1, 6)) * 60_000;
}

// A fixed Google event ID makes creation safe even if Google accepts the request but
// the response or subsequent database write fails.
export async function syncAppointment(appointmentId: number) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1, $2)", [57311, appointmentId]);
    const [appointment] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, appointmentId));
    let [record] = await db.select().from(appointmentCalendarSyncTable)
      .where(eq(appointmentCalendarSyncTable.appointmentId, appointmentId));
    if (!appointment && !record) return;
    const destination = await selectedCalendar();
    if (!record) {
      [record] = await db.insert(appointmentCalendarSyncTable).values({
        appointmentId, calendarId: destination, eventId: `rikki${appointmentId.toString(32)}`,
      }).onConflictDoNothing().returning();
      if (!record) [record] = await db.select().from(appointmentCalendarSyncTable)
        .where(eq(appointmentCalendarSyncTable.appointmentId, appointmentId));
    }
    try {
      if (record.calendarId !== destination) {
        if (record.status !== "removed") {
          try {
            await calendarRequest(`${eventPath(record.calendarId, record.eventId)}?sendUpdates=none`, { method: "DELETE" });
          } catch (error) {
            if (statusOf(error) !== 404 && statusOf(error) !== 410) throw error;
          }
        }
        await db.update(appointmentCalendarSyncTable).set({ calendarId: destination, status: "pending" })
          .where(eq(appointmentCalendarSyncTable.appointmentId, appointmentId));
        record.calendarId = destination;
      }
      if (!appointment || appointment.status === "cancelled" || record.deleted) {
        if (record.status !== "removed") {
          try {
            await calendarRequest(`${eventPath(record.calendarId, record.eventId)}?sendUpdates=none`, { method: "DELETE" });
          } catch (error) {
            if (statusOf(error) !== 404 && statusOf(error) !== 410) throw error;
          }
        }
        await db.update(appointmentCalendarSyncTable).set({
          status: "removed", error: null, syncedAt: new Date(), attempts: 0, nextRetryAt: null,
        })
          .where(eq(appointmentCalendarSyncTable.appointmentId, appointmentId));
        return;
      }
      const body = eventForAppointment(appointment);
      const path = `${eventPath(record.calendarId, record.eventId)}?sendUpdates=none`;
      try {
        await calendarRequest(path, { method: "PATCH", body: JSON.stringify(body) });
      } catch (error) {
        if (statusOf(error) !== 404 && statusOf(error) !== 410) throw error;
        try {
          await calendarRequest(`${eventPath(record.calendarId)}?sendUpdates=none`, {
            method: "POST", body: JSON.stringify({ ...body, id: record.eventId }),
          });
        } catch (insertError) {
          if (statusOf(insertError) !== 409) throw insertError;
          await calendarRequest(path, { method: "PATCH", body: JSON.stringify(body) });
        }
      }
      await db.update(appointmentCalendarSyncTable).set({
        status: "synced", error: null, syncedAt: new Date(), deleted: false, attempts: 0, nextRetryAt: null,
      })
        .where(eq(appointmentCalendarSyncTable.appointmentId, appointmentId));
    } catch (error) {
      const attempts = record.attempts + 1;
      await db.update(appointmentCalendarSyncTable).set({
        status: "failed", error: error instanceof Error ? error.message.slice(0, 400) : "Unknown calendar error",
        attempts, nextRetryAt: new Date(Date.now() + retryDelayMs(attempts)),
      }).where(eq(appointmentCalendarSyncTable.appointmentId, appointmentId));
      throw error;
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1, $2)", [57311, appointmentId]).finally(() => client.release());
  }
}

export async function trySyncAppointment(appointmentId: number) {
  try {
    await syncAppointment(appointmentId);
  } catch (error) {
    logger.error({ appointmentId, error: error instanceof Error ? error.message : "Unknown error" }, "Calendar sync failed; appointment saved");
  }
}

export async function calendarSyncHealth() {
  const destination = await selectedCalendar();
  const rows = await db.select({
    sync: appointmentCalendarSyncTable,
    appointment: { status: appointmentsTable.status, appointmentDate: appointmentsTable.appointmentDate },
  }).from(appointmentCalendarSyncTable).leftJoin(appointmentsTable,
    eq(appointmentCalendarSyncTable.appointmentId, appointmentsTable.id));
  const today = localToday();
  const upcoming = await db.select({ id: appointmentsTable.id }).from(appointmentsTable)
    .where(and(gte(appointmentsTable.appointmentDate, today), inArray(appointmentsTable.status, ["pending", "confirmed"])));
  const unsynced = upcoming.filter((item) => !rows.some((row) => row.sync.appointmentId === item.id));
  const failed = rows.filter(({ sync }) => sync.status === "failed").length;
  const queued = unsynced.length + rows.filter(({ sync, appointment }) =>
    sync.status === "pending" ||
    (sync.status === "synced" && (sync.deleted || appointment?.status === "cancelled" || sync.calendarId !== destination)) ||
    (sync.status === "removed" && !sync.deleted && appointment &&
      appointment.appointmentDate >= today && (appointment.status === "pending" || appointment.status === "confirmed"))
  ).length;
  try {
    const calendars = await writableCalendars();
    return {
      connected: true, calendarId: destination, calendars, failed, queued,
      unsynced: unsynced.length,
      error: calendars.some((item) => item.id === destination || (destination === "primary" && item.primary))
        ? null : "Selected calendar is no longer writable.",
    };
  } catch (error) {
    return {
      connected: false, calendarId: destination, calendars: [], failed, queued,
      unsynced: unsynced.length, error: error instanceof Error ? error.message : "Calendar connection unavailable",
    };
  }
}

function localToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function reconciliationIds(force: boolean) {
  const destination = await selectedCalendar();
  const active = and(gte(appointmentsTable.appointmentDate, localToday()),
    inArray(appointmentsTable.status, ["pending", "confirmed"]));
  const due = force ? undefined : or(isNull(appointmentCalendarSyncTable.nextRetryAt),
    lte(appointmentCalendarSyncTable.nextRetryAt, new Date()));
  const existing = await db.select({ id: appointmentCalendarSyncTable.appointmentId })
    .from(appointmentCalendarSyncTable)
    .leftJoin(appointmentsTable, eq(appointmentCalendarSyncTable.appointmentId, appointmentsTable.id))
    .where(or(
      and(inArray(appointmentCalendarSyncTable.status, ["pending", "failed"]), due),
      and(eq(appointmentCalendarSyncTable.status, "synced"), or(
        eq(appointmentCalendarSyncTable.deleted, true), eq(appointmentsTable.status, "cancelled"),
        ne(appointmentCalendarSyncTable.calendarId, destination),
      )),
      and(eq(appointmentCalendarSyncTable.status, "removed"), eq(appointmentCalendarSyncTable.deleted, false), active),
    ))
    .orderBy(appointmentCalendarSyncTable.appointmentId).limit(batchSize);
  const missing = existing.length === batchSize ? [] : await db.select({ id: appointmentsTable.id })
    .from(appointmentsTable)
    .leftJoin(appointmentCalendarSyncTable, eq(appointmentsTable.id, appointmentCalendarSyncTable.appointmentId))
    .where(and(active, isNull(appointmentCalendarSyncTable.appointmentId)))
    .orderBy(appointmentsTable.id).limit(batchSize - existing.length);
  return [...existing, ...missing].map((row) => row.id);
}

export async function retryCalendarSync(force = true) {
  const ids = await reconciliationIds(force);
  let failed = 0;
  for (const id of ids) {
    try { await syncAppointment(id); } catch { failed += 1; }
  }
  return { processed: ids.length, failed };
}

// One worker per database, including when multiple API processes are running.
export async function reconcileCalendarInBackground() {
  const client = await pool.connect();
  let locked = false;
  try {
    const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1, $2) AS locked", [57311, 0]);
    locked = result.rows[0]?.locked ?? false;
    if (!locked) return;
    const outcome = await retryCalendarSync(false);
    if (outcome.processed || outcome.failed) logger.info(outcome, "Calendar reconciliation completed");
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1, $2)", [57311, 0]).finally(() => client.release());
    else client.release();
  }
}