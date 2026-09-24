import assert from "node:assert/strict";
import test from "node:test";
import type { Appointment } from "@workspace/db";
import {
  appointmentEmailEventKey,
  buildGmailRaw,
  canSendNotification,
  getEmailDeliveryStatus,
  notificationEventForUpdate,
  renderAppointmentEmail,
  renderOwnerBookingEmail,
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
  assert.match(message.text, /Rikki will be in touch shortly to confirm your appointment/);
  assert.doesNotMatch(message.text, /Your appointment is confirmed\./);
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

test("builds a Gmail message with readable headers and encoded HTML", () => {
  const message = renderAppointmentEmail("confirmed", appointment);
  const raw = Buffer.from(
    buildGmailRaw("Rikki Wigs <sender@example.com>", message),
    "base64url",
  ).toString("utf8");
  assert.match(raw, /^From: Rikki Wigs <sender@example\.com>\r\nTo: ana@example\.com\r\nSubject: Your Rikki Wigs appointment is confirmed/m);
  assert.match(raw, /Content-Type: multipart\/alternative/);
  assert.match(raw, /Content-Type: text\/html; charset="UTF-8"/);
  assert.doesNotMatch(raw, /Ana <script>/);
  assert.match(raw, /Content-Transfer-Encoding: base64/);
});

test("alerts the sender with contact details for pending and confirmed bookings", () => {
  const from = "Rikki Wigs <sender@example.com>";
  const pending = renderOwnerBookingEmail(appointment, from);
  const confirmed = renderOwnerBookingEmail({ ...appointment, status: "confirmed" }, from);
  assert.equal(pending.to, "sender@example.com");
  assert.match(pending.subject, /request/i);
  assert.match(confirmed.subject, /confirmed/i);
  assert.match(pending.text, /Email: ana@example\.com/);
  assert.match(pending.text, /Phone: 555-0100/);
  assert.match(pending.text, /Thursday, October 15, 2026 at 1:30 PM/);
  assert.match(pending.html, /Ana &lt;script&gt;/);
  assert.doesNotMatch(pending.html, /Ana <script>/);
  assert.equal(
    appointmentEmailEventKey(appointment, "owner_new_appointment"),
    appointmentEmailEventKey({ ...appointment, appointmentTime: "2:00 PM" }, "owner_new_appointment"),
  );
});

test("emails clients when they request a booking and still sends the later confirmation", () => {
  assert.equal(canSendNotification("request_received", "gmail"), true);
  assert.equal(canSendNotification("request_received", "smtp"), true);
  assert.equal(canSendNotification("request_received", "disabled"), false);
  assert.equal(canSendNotification("owner_new_appointment", "gmail"), true);
  assert.equal(canSendNotification("confirmed", "gmail"), true);
  assert.equal(canSendNotification("cancelled", "gmail"), false);
});