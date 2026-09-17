import {
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
]);

export const appointmentsTable = pgTable("appointments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  service: text("service").notNull(),
  serviceId: integer("service_id"),
  serviceDurationMinutes: integer("service_duration_minutes").notNull().default(60),
  appointmentDate: date("appointment_date", { mode: "string" }).notNull(),
  appointmentTime: text("appointment_time").notNull(),
  status: appointmentStatusEnum("status").notNull().default("pending"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAppointmentSchema = createInsertSchema(
  appointmentsTable,
).omit({ id: true, createdAt: true, serviceId: true, serviceDurationMinutes: true });

export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;

export type TimeWindow = { id: string; start: string; end: string };
export type WeeklyHours = Record<string, Record<string, TimeWindow[]>>;
export type BlockedSlot = { id: string; date: string; startTime: string; endTime: string; reason: string };

export const schedulingSettingsTable = pgTable("scheduling_settings", {
  id: integer("id").primaryKey().default(1),
  serviceDurations: jsonb("service_durations").$type<Record<string, number>>().notNull(),
  weeklyHours: jsonb("weekly_hours").$type<WeeklyHours>().notNull(),
  blockedSlots: jsonb("blocked_slots").$type<BlockedSlot[]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SchedulingSettings = typeof schedulingSettingsTable.$inferSelect;