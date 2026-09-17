import assert from "node:assert/strict";
import test from "node:test";
import type { Appointment } from "@workspace/db";
import {
  getEmailDeliveryStatus,
  notificationEventForUpdate,
  renderAppointmentEmail,
} from "./appointment-emails";

const appointment: Appointment = {
  id: 42,
  name: "Ana <script>",
  phone: "555-0100",
  email: "ana@example.com",
  service: "Custom color & styling",
  serviceId: 3,
  serviceDurationMinutes: 120,
  appointmentDate: "2026-10-15",
  appointmentTime: "1:30 PM",
  status: "pending",
  notes: "",
  createdAt: new Date("2026-09-17T12:00:00Z"),
};

test("renders a safe request-received message with appointment details", () => {
  const message = renderAppointmentEmail(
    "request_received",
    appointment,
    "America/New_York",
  );

  assert.equal(message.to, "ana@example.com");
  assert.equal(message.subject, "We received your appointment request");
  assert.match(message.text, /Custom color & styling/);
  assert.match(message.text, /Thursday, October 15, 2026 at 1:30 PM/);
  assert.match(message.html, /Custom color &amp; styling/);
  assert.doesNotMatch(message.html, /Ana <script>/);
});

test("renders the expected subject for every customer event", () => {
  assert.match(
    renderAppointmentEmail("confirmed", appointment).subject,
    /confirmed/i,
  );
  assert.match(
    renderAppointmentEmail("cancelled", appointment).subject,
    /cancelled/i,
  );
  assert.match(
    renderAppointmentEmail("rescheduled", appointment).subject,
    /updated/i,
  );
  assert.match(
    renderAppointmentEmail("completed", appointment).subject,
    /thank you/i,
  );
});

test("selects one notification for an actual status or schedule change", () => {
  const confirmed = { ...appointment, status: "confirmed" as const };
  assert.equal(
    notificationEventForUpdate(appointment, confirmed),
    "confirmed",
  );
  assert.equal(
    notificationEventForUpdate(confirmed, {
      ...confirmed,
      appointmentTime: "2:00 PM",
    }),
    "rescheduled",
  );
  assert.equal(notificationEventForUpdate(confirmed, confirmed), null);
});

test("defaults to disabled delivery when the client has not configured SMTP", () => {
  const originalMode = process.env.EMAIL_DELIVERY_MODE;
  delete process.env.EMAIL_DELIVERY_MODE;
  try {
    assert.deepEqual(getEmailDeliveryStatus(), {
      mode: "disabled",
      configured: false,
      label: "Email delivery is disabled",
    });
  } finally {
    if (originalMode === undefined) delete process.env.EMAIL_DELIVERY_MODE;
    else process.env.EMAIL_DELIVERY_MODE = originalMode;
  }
});