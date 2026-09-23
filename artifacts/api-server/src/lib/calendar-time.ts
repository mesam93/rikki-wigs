import type { Appointment } from "@workspace/db";

const timezone = "America/New_York";

// Resolve the offset at the appointment's local wall-clock time, not at UTC midnight.
// Iteration handles the UTC day on either side of daylight-saving transitions.
export function localDateTime(date: string, time: string, minutesToAdd = 0): string {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(time.trim());
  if (!match) throw new Error("Invalid appointment time");
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59 || (match[3] && (hour < 1 || hour > 12))) throw new Error("Invalid appointment time");
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
  const local = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(local.valueOf())) throw new Error("Invalid appointment date");
  local.setUTCHours(hour, minute + minutesToAdd, 0, 0);
  const offsetFormatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "shortOffset" });
  let instant = local.valueOf();
  let offset = 0;
  for (let i = 0; i < 3; i++) {
    const zone = offsetFormatter.formatToParts(instant).find((part) => part.type === "timeZoneName")?.value ?? "";
    const parts = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zone);
    if (!parts) throw new Error("Could not determine salon timezone offset");
    offset = (parts[1] === "+" ? 1 : -1) * (Number(parts[2]) * 60 + Number(parts[3] ?? 0));
    instant = local.valueOf() - offset * 60_000;
  }
  const sign = offset < 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  return `${local.toISOString().slice(0, 19)}${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export function eventForAppointment(appointment: Appointment) {
  const label = appointment.status[0].toUpperCase() + appointment.status.slice(1);
  return {
    summary: `[${label}] ${appointment.service} — Rikki Wigs`,
    description: `Rikki Wigs appointment #${appointment.id}. Manage details on the website.`,
    start: { dateTime: localDateTime(appointment.appointmentDate, appointment.appointmentTime), timeZone: timezone },
    end: { dateTime: localDateTime(appointment.appointmentDate, appointment.appointmentTime, appointment.serviceDurationMinutes), timeZone: timezone },
  };
}