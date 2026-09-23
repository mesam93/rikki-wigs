import assert from "node:assert/strict";
import { test } from "node:test";
import type { Appointment } from "@workspace/db";
import { eventForAppointment, eventIdForAppointment, localDateTime } from "./calendar-time";

test("published and development appointments with the same ID use different stable Google IDs", () => {
  assert.equal(eventIdForAppointment(5, false), "rikki5");
  assert.equal(eventIdForAppointment(5, true), "rikkip5");
  assert.notEqual(eventIdForAppointment(1024, false), eventIdForAppointment(1024, true));
});

test("New York appointment times use the offset on each side of DST", () => {
  assert.equal(localDateTime("2026-03-07", "10:00 AM"), "2026-03-07T10:00:00-05:00");
  assert.equal(localDateTime("2026-03-08", "10:00 AM"), "2026-03-08T10:00:00-04:00");
  assert.equal(localDateTime("2026-10-31", "10:00 AM"), "2026-10-31T10:00:00-04:00");
  assert.equal(localDateTime("2026-11-01", "10:00 AM"), "2026-11-01T10:00:00-05:00");
});

test("events use service duration and do not include client contact or notes", () => {
  const appointment = {
    id: 7, service: "Styling", status: "pending",
    appointmentDate: "2026-03-08", appointmentTime: "10:00 AM",
    serviceDurationMinutes: 90, name: "Private Client",
    email: "private@example.com", phone: "555-0000", notes: "confidential",
  } as Appointment;
  const event = eventForAppointment(appointment);
  assert.match(event.summary, /^\[Pending\]/);
  assert.equal(event.end.dateTime, "2026-03-08T11:30:00-04:00");
  for (const value of [appointment.name, appointment.email, appointment.phone, appointment.notes]) {
    assert.equal(JSON.stringify(event).includes(value), false);
  }
  assert.match(eventForAppointment({ ...appointment, status: "completed" }).summary, /^\[Completed\]/);
});