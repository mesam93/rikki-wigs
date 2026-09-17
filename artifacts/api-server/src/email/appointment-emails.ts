import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import {
  appointmentEmailNotificationsTable,
  db,
  type Appointment,
} from "@workspace/db";

export type EmailDeliveryMode = "disabled" | "test" | "smtp";
export type AppointmentEmailEvent =
  | "request_received"
  | "confirmed"
  | "cancelled"
  | "rescheduled"
  | "completed";

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
  eventType: AppointmentEmailEvent;
  error?: string;
};

function parseMode(value: string | undefined): EmailDeliveryMode {
  if (!value) return "disabled";
  if (value === "disabled" || value === "test" || value === "smtp") return value;
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
        heading: "You are on the list.",
        message:
          "Thank you for reaching out. Rikki will review your request and contact you when your appointment is confirmed.",
      };
    case "confirmed":
      return {
        subject: "Your Rikki Wigs appointment is confirmed",
        eyebrow: "Appointment confirmed",
        heading: "Your time is reserved.",
        message:
          "Your appointment has been approved. We look forward to seeing you.",
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

async function sendWithRetry(config: EmailConfig, message: EmailMessage) {
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
  event: AppointmentEmailEvent,
): string {
  if (event === "request_received") {
    return `appointment:${appointment.id}:request_received`;
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
  event: AppointmentEmailEvent,
  appointment: Appointment,
): Promise<NotificationResult> {
  const config = getEmailConfig();
  const message = renderAppointmentEmail(event, appointment, config.timezone);
  const eventKey = appointmentEmailEventKey(appointment, event);
  const initialStatus =
    config.mode === "disabled"
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
  if (config.mode === "disabled") return { outcome: "disabled", eventType: event };
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
    await db
      .update(appointmentEmailNotificationsTable)
      .set({
        deliveryStatus: "delivered",
        errorMessage: null,
        deliveredAt: new Date(),
      })
      .where(eq(appointmentEmailNotificationsTable.eventKey, eventKey));
    return { outcome: "delivered", eventType: event };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown email delivery error";
    await db
      .update(appointmentEmailNotificationsTable)
      .set({ deliveryStatus: "failed", errorMessage })
      .where(eq(appointmentEmailNotificationsTable.eventKey, eventKey));
    return { outcome: "failed", eventType: event, error: errorMessage };
  }
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