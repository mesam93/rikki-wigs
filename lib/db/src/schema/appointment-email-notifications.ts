import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { appointmentsTable } from "./appointments";

export const appointmentEmailNotificationsTable = pgTable(
  "appointment_email_notifications",
  {
    eventKey: text("event_key").primaryKey(),
    appointmentId: integer("appointment_id")
      .notNull()
      .references(() => appointmentsTable.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    deliveryStatus: text("delivery_status").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
);

export type AppointmentEmailNotification =
  typeof appointmentEmailNotificationsTable.$inferSelect;