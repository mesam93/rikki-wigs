import { ReplitConnectors } from "@replit/connectors-sdk";
import { and, eq, gte, inArray } from "drizzle-orm";
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
        await db.update(appointmentCalendarSyncTable).set({ status: "removed", error: null, syncedAt: new Date() })
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
      await db.update(appointmentCalendarSyncTable).set({ status: "synced", error: null, syncedAt: new Date(), deleted: false })
        .where(eq(appointmentCalendarSyncTable.appointmentId, appointmentId));
    } catch (error) {
      await db.update(appointmentCalendarSyncTable).set({
        status: "failed", error: error instanceof Error ? error.message.slice(0, 400) : "Unknown calendar error",
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
  const rows = await db.select().from(appointmentCalendarSyncTable);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const upcoming = await db.select({ id: appointmentsTable.id }).from(appointmentsTable)
    .where(and(gte(appointmentsTable.appointmentDate, today), inArray(appointmentsTable.status, ["pending", "confirmed"])));
  const unsynced = upcoming.filter((item) => !rows.some((row) => row.appointmentId === item.id));
  try {
    const calendars = await writableCalendars();
    return {
      connected: true, calendarId: destination, calendars, failed: rows.filter((row) => row.status === "failed").length,
      unsynced: unsynced.length,
      error: calendars.some((item) => item.id === destination || (destination === "primary" && item.primary))
        ? null : "Selected calendar is no longer writable.",
    };
  } catch (error) {
    return {
      connected: false, calendarId: destination, calendars: [], failed: rows.filter((row) => row.status === "failed").length,
      unsynced: unsynced.length, error: error instanceof Error ? error.message : "Calendar connection unavailable",
    };
  }
}

export async function retryCalendarSync() {
  const destination = await selectedCalendar();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const upcoming = await db.select({ id: appointmentsTable.id }).from(appointmentsTable)
    .where(and(gte(appointmentsTable.appointmentDate, today), inArray(appointmentsTable.status, ["pending", "confirmed"])));
  const rows = await db.select().from(appointmentCalendarSyncTable);
  const ids = new Set([
    ...upcoming.map((item) => item.id),
    ...rows.filter((row) => row.status === "failed" || (row.status === "synced" && row.calendarId !== destination)).map((row) => row.appointmentId),
  ]);
  let failed = 0;
  for (const id of ids) {
    try { await syncAppointment(id); } catch { failed += 1; }
  }
  return { processed: ids.size, failed };
}