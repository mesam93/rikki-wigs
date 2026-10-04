import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { directGmailConfigured, gmailTransport, sendDirectGmail } from "./direct-gmail";
import {
  appointmentEmailNotificationsTable,
  db,
  type Appointment,
} from "@workspace/db";

export type EmailDeliveryMode = "disabled" | "test" | "smtp" | "gmail";
export type AppointmentEmailEvent =
  | "request_received"
  | "confirmed"
  | "cancelled"
  | "rescheduled"
  | "completed";
export type NotificationEvent = AppointmentEmailEvent | "owner_new_appointment";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type EmailConfig = {
  mode: EmailDeliveryMode;
  from: string;
  replyTo?: string;
  timezone: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    username?: string;
    password?: string;
  };
};

export type EmailDeliveryStatus = {
  mode: EmailDeliveryMode;
  configured: boolean;
  label: string;
};

export type NotificationResult = {
  outcome: "delivered" | "tested" | "disabled" | "duplicate" | "failed";
  eventType: NotificationEvent;
  error?: string;
  recordError?: string;
};

function parseMode(value: string | undefined): EmailDeliveryMode {
  if (!value) return "disabled";
  if (value === "disabled" || value === "test" || value === "smtp" || value === "gmail") return value;
  return "disabled";
}

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

function getEmailConfig(): EmailConfig {
  const mode = parseMode(process.env.EMAIL_DELIVERY_MODE);
  const port = Number(process.env.SMTP_PORT ?? "587");
  return {
    mode,
    from: process.env.EMAIL_FROM ?? "Rikki Wigs <appointments@example.com>",
    replyTo: process.env.EMAIL_REPLY_TO,
    timezone: process.env.EMAIL_TIMEZONE ?? "America/New_York",
    smtp:
      mode === "smtp"
        ? {
            host: process.env.SMTP_HOST ?? "",
            port: Number.isInteger(port) && port > 0 ? port : 587,
            secure: parseBoolean(process.env.SMTP_SECURE),
            username: process.env.SMTP_USERNAME,
            password: process.env.SMTP_PASSWORD,
          }
        : undefined,
  };
}

export function getEmailDeliveryStatus(): EmailDeliveryStatus {
  const config = getEmailConfig();
  if (config.mode === "disabled") {
    return {
      mode: config.mode,
      configured: false,
      label: "Email delivery is disabled",
    };
  }
  if (config.mode === "test") {
    return {
      mode: config.mode,
      configured: true,
      label: "Email test mode is active — nothing is sent",
    };
  }
  if (config.mode === "gmail") {
    const transport = gmailTransport();
    if (!transport) {
      return { mode: config.mode, configured: false, label: "GMAIL_TRANSPORT must be replit or direct" };
    }
    if (transport === "direct" && !directGmailConfigured()) {
      return {
        mode: config.mode,
        configured: false,
        label: "Direct Gmail needs mailbox authorization: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN",
      };
    }
    const configured = Boolean(process.env.EMAIL_FROM?.trim());
    return {
      mode: config.mode,
      configured,
      label: configured
        ? `${transport === "direct" ? "Direct Gmail" : "Gmail"} is selected for request receipts, confirmations, and owner alerts`
        : "Gmail needs EMAIL_FROM set to the connected account address",
    };
  }
  const configured = Boolean(
    config.smtp?.host &&
      config.smtp.port &&
      config.from &&
      (!config.smtp.username || config.smtp.password),
  );
  return {
    mode: config.mode,
    configured,
    label: configured
      ? "Customer email delivery is active"
      : "SMTP mode is selected but configuration is incomplete",
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function formatDate(date: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(`${date}T12:00:00Z`));
}

function templateCopy(event: AppointmentEmailEvent): {
  subject: string;
  eyebrow: string;
  heading: string;
  message: string;
} {
  switch (event) {
    case "request_received":
      return {
        subject: "We received your appointment request",
        eyebrow: "Request received",
        heading: "We received your request.",
        message:
          "Thank you for requesting an appointment. Rikki will be in touch shortly to confirm your appointment.",
      };
    case "confirmed":
      return {
        subject: "Your Rikki Wigs appointment is confirmed",
        eyebrow: "Appointment confirmed",
        heading: "Your time is reserved.",
        message:
          "Your appointment is confirmed. We look forward to seeing you.",
      };
    case "cancelled":
      return {
        subject: "Your appointment request was cancelled",
        eyebrow: "Appointment update",
        heading: "Your appointment was cancelled.",
        message:
          "This appointment is no longer scheduled. Reply to this email if you have questions or would like to request another time.",
      };
    case "rescheduled":
      return {
        subject: "Your Rikki Wigs appointment time was updated",
        eyebrow: "New appointment time",
        heading: "Your schedule has changed.",
        message:
          "Please review the updated appointment details below. Reply to this email if the new time does not work for you.",
      };
    case "completed":
      return {
        subject: "Thank you for visiting Rikki Wigs",
        eyebrow: "Appointment completed",
        heading: "Thank you for coming in.",
        message:
          "It was a pleasure working with you. Reply to this email if you have any follow-up questions.",
      };
  }
}

export function renderAppointmentEmail(
  event: AppointmentEmailEvent,
  appointment: Appointment,
  timezone = getEmailConfig().timezone,
): EmailMessage {
  const copy = templateCopy(event);
  const firstName = appointment.name.trim().split(/\s+/)[0] || "there";
  const date = formatDate(appointment.appointmentDate, timezone);
  const details = `${appointment.service} — ${date} at ${appointment.appointmentTime}`;
  const safeName = escapeHtml(firstName);
  const safeService = escapeHtml(appointment.service);
  const safeDate = escapeHtml(date);
  const safeTime = escapeHtml(appointment.appointmentTime);

  return {
    to: appointment.email,
    subject: copy.subject,
    text: [
      `Hi ${firstName},`,
      "",
      copy.message,
      "",
      details,
      "",
      "Rikki Wigs",
    ].join("\n"),
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f6f1ef;color:#35252a;font-family:Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(copy.message)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f1ef;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #eadfdb;border-radius:18px;overflow:hidden">
          <tr><td style="padding:42px 40px 20px">
            <p style="margin:0 0 14px;color:#985c6d;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${escapeHtml(copy.eyebrow)}</p>
            <h1 style="margin:0;font-family:Georgia,serif;font-size:36px;line-height:1.12;font-weight:400">${escapeHtml(copy.heading)}</h1>
          </td></tr>
          <tr><td style="padding:0 40px 28px">
            <p style="font-size:16px;line-height:1.7">Hi ${safeName},</p>
            <p style="font-size:16px;line-height:1.7;color:#67565c">${escapeHtml(copy.message)}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:26px;background:#f8f4f2;border-radius:12px">
              <tr><td style="padding:22px">
                <p style="margin:0 0 7px;font-size:12px;color:#806d73;text-transform:uppercase;letter-spacing:1px">Service</p>
                <p style="margin:0 0 18px;font-size:16px;font-weight:700">${safeService}</p>
                <p style="margin:0 0 7px;font-size:12px;color:#806d73;text-transform:uppercase;letter-spacing:1px">Date &amp; time</p>
                <p style="margin:0;font-size:16px;font-weight:700">${safeDate} at ${safeTime}</p>
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:24px 40px;background:#3c272e;color:#fff">
            <p style="margin:0;font-family:Georgia,serif;font-size:20px">Rikki Wigs</p>
            <p style="margin:8px 0 0;color:#dacdd1;font-size:13px">Reply to this email if you need help with your appointment.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}

function senderAddress(from: string): string {
  const match = from.trim().match(/<([^<>]+)>\s*$/);
  const address = (match?.[1] ?? from).trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) {
    throw new Error("EMAIL_FROM must contain the sender's email address for owner alerts");
  }
  return address;
}

export function renderOwnerBookingEmail(
  appointment: Appointment,
  from: string,
  timezone = getEmailConfig().timezone,
): EmailMessage {
  const confirmed = appointment.status === "confirmed";
  const heading = confirmed ? "New confirmed appointment" : "New appointment request";
  const date = formatDate(appointment.appointmentDate, timezone);
  const details = [
    `Customer: ${appointment.name}`,
    `Service: ${appointment.service}`,
    `Date and time: ${date} at ${appointment.appointmentTime} (New York time)`,
    `Email: ${appointment.email}`,
    `Phone: ${appointment.phone}`,
    ...(appointment.notes.trim() ? [`Notes: ${appointment.notes.trim()}`] : []),
  ];
  return {
    to: senderAddress(from),
    subject: `${heading} - Rikki Wigs`,
    text: [heading, "", ...details].join("\n"),
    html: `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#35252a;line-height:1.6">
      <h1 style="font-family:Georgia,serif">${heading}</h1>
      <p>${confirmed ? "The appointment is confirmed." : "A client submitted a request awaiting confirmation."}</p>
      <dl>${details.map((line) => {
        const separator = line.indexOf(": ");
        return `<dt style="font-weight:bold">${escapeHtml(line.slice(0, separator))}</dt><dd style="margin:0 0 12px">${escapeHtml(line.slice(separator + 2))}</dd>`;
      }).join("")}</dl>
    </body></html>`,
  };
}

async function sendWithSmtp(config: EmailConfig, message: EmailMessage) {
  if (!config.smtp?.host) throw new Error("SMTP_HOST is required");
  if (!config.from) throw new Error("EMAIL_FROM is required");
  if (config.smtp.username && !config.smtp.password) {
    throw new Error("SMTP_PASSWORD is required when SMTP_USERNAME is set");
  }

  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth:
      config.smtp.username && config.smtp.password
        ? {
            user: config.smtp.username,
            pass: config.smtp.password,
          }
        : undefined,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
    tls: { minVersion: "TLSv1.2" },
  });
  try {
    await transport.sendMail({
      from: config.from,
      to: message.to,
      replyTo: config.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } finally {
    transport.close();
  }
}

export function buildGmailRaw(from: string, message: EmailMessage, replyTo?: string) {
  const safeHeader = (value: string) => value.replace(/[\r\n]/g, " ");
  const boundary = `rikki-appointment-${crypto.randomUUID()}`;
  const encodedPart = (value: string) => Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  const raw = [
    `From: ${safeHeader(from)}`,
    `To: ${safeHeader(message.to)}`,
    ...(replyTo ? [`Reply-To: ${safeHeader(replyTo)}`] : []),
    `Subject: ${safeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodedPart(message.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodedPart(message.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(raw, "utf8").toString("base64url");
}

async function sendWithGmail(config: EmailConfig, message: EmailMessage) {
  if (!process.env.EMAIL_FROM?.trim()) throw new Error("Gmail needs EMAIL_FROM set to the connected account address");
  const transport = gmailTransport();
  if (!transport) throw new Error("GMAIL_TRANSPORT must be replit or direct");
  const raw = buildGmailRaw(config.from, message, config.replyTo);
  if (transport === "direct") return sendDirectGmail(raw);
  const response = await new ReplitConnectors().proxy("google-mail", "/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: { message?: string }; message?: string } | null;
    throw new Error(error?.error?.message ?? error?.message ?? `Gmail returned ${response.status}`);
  }
}

async function sendWithRetry(config: EmailConfig, message: EmailMessage) {
  // Gmail has no idempotency key for messages/send, so retrying an ambiguous failure can send duplicates.
  if (config.mode === "gmail") return sendWithGmail(config, message);
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await sendWithSmtp(config, message);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }
  throw lastError;
}

export function appointmentEmailEventKey(
  appointment: Appointment,
  event: NotificationEvent,
): string {
  if (event === "request_received" || event === "owner_new_appointment") {
    return `appointment:${appointment.id}:${event}`;
  }
  return [
    "appointment",
    appointment.id,
    event,
    appointment.appointmentDate,
    appointment.appointmentTime.toLowerCase().replace(/\s+/g, "-"),
  ].join(":");
}

export async function sendAppointmentNotification(
  event: NotificationEvent,
  appointment: Appointment,
): Promise<NotificationResult> {
  const config = getEmailConfig();
  const message = event === "owner_new_appointment"
    ? renderOwnerBookingEmail(appointment, config.from, config.timezone)
    : renderAppointmentEmail(event, appointment, config.timezone);
  const eventKey = appointmentEmailEventKey(appointment, event);
  const canSend = canSendNotification(event, config.mode);
  const initialStatus =
    !canSend
      ? "disabled"
      : config.mode === "test"
        ? "tested"
        : "sending";

  const inserted = await db
    .insert(appointmentEmailNotificationsTable)
    .values({
      eventKey,
      appointmentId: appointment.id,
      eventType: event,
      recipient: message.to,
      subject: message.subject,
      deliveryStatus: initialStatus,
      deliveredAt: config.mode === "test" ? new Date() : null,
    })
    .onConflictDoNothing()
    .returning({ eventKey: appointmentEmailNotificationsTable.eventKey });

  if (!inserted.length) return { outcome: "duplicate", eventType: event };
  if (!canSend) return { outcome: "disabled", eventType: event };
  if (config.mode === "test") return { outcome: "tested", eventType: event };

  const deliveryStatus = getEmailDeliveryStatus();
  if (!deliveryStatus.configured) {
    const error = deliveryStatus.label;
    await db
      .update(appointmentEmailNotificationsTable)
      .set({ deliveryStatus: "failed", errorMessage: error })
      .where(eq(appointmentEmailNotificationsTable.eventKey, eventKey));
    return { outcome: "failed", eventType: event, error };
  }

  try {
    await sendWithRetry(config, message);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown email delivery error";
    try {
      await db
        .update(appointmentEmailNotificationsTable)
        .set({ deliveryStatus: "failed", errorMessage })
        .where(eq(appointmentEmailNotificationsTable.eventKey, eventKey));
    } catch (recordError) {
      return {
        outcome: "failed",
        eventType: event,
        error: errorMessage,
        recordError: recordError instanceof Error ? recordError.message : "Could not record delivery failure",
      };
    }
    return { outcome: "failed", eventType: event, error: errorMessage };
  }

  try {
    await db
      .update(appointmentEmailNotificationsTable)
      .set({
        deliveryStatus: "delivered",
        errorMessage: null,
        deliveredAt: new Date(),
      })
      .where(eq(appointmentEmailNotificationsTable.eventKey, eventKey));
  } catch (error) {
    return {
      outcome: "delivered",
      eventType: event,
      recordError: error instanceof Error ? error.message : "Could not record delivery success",
    };
  }
  return { outcome: "delivered", eventType: event };
}

export function canSendNotification(event: NotificationEvent, mode: EmailDeliveryMode): boolean {
  return mode !== "disabled"
    && (mode !== "gmail" || event === "request_received" || event === "confirmed" || event === "owner_new_appointment");
}

export function notificationEventForUpdate(
  before: Appointment,
  after: Appointment,
): AppointmentEmailEvent | null {
  if (before.status !== after.status) {
    if (after.status === "confirmed") return "confirmed";
    if (after.status === "cancelled") return "cancelled";
    if (after.status === "completed") return "completed";
  }
  if (
    before.appointmentDate !== after.appointmentDate ||
    before.appointmentTime !== after.appointmentTime
  ) {
    return "rescheduled";
  }
  return null;
}