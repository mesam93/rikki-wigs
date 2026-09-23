import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Deliberately no appointment FK: a failed Google deletion must survive deletion of the booking.
export const appointmentCalendarSyncTable = pgTable("appointment_calendar_sync", {
  appointmentId: integer("appointment_id").primaryKey(),
  calendarId: text("calendar_id").notNull(),
  eventId: text("event_id").notNull(),
  deleted: boolean("deleted").notNull().default(false),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
});

export const calendarSyncSettingsTable = pgTable("calendar_sync_settings", {
  id: integer("id").primaryKey().default(1),
  calendarId: text("calendar_id").notNull().default("primary"),
});