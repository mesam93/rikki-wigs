type Environment = Record<string, string | undefined>;
export type CalendarTransport = "replit" | "direct";
export type CalendarNamespace = "development" | "published" | "railway";

export function directCalendarConfigured(env: Environment = process.env): boolean {
  return Boolean(env.CALENDAR_CLIENT_ID?.trim() && env.CALENDAR_CLIENT_SECRET?.trim()
    && env.CALENDAR_REFRESH_TOKEN?.trim());
}

export function calendarConfig(env: Environment = process.env) {
  const transportValue = env.CALENDAR_TRANSPORT ?? "replit";
  const transport: CalendarTransport | null =
    transportValue === "replit" || transportValue === "direct" ? transportValue : null;
  const namespaceValue = env.CALENDAR_EVENT_NAMESPACE
    ?? (transport === "direct" ? "railway" : env.REPLIT_DEPLOYMENT === "1" ? "published" : "development");
  const namespace: CalendarNamespace | null =
    namespaceValue === "railway" || namespaceValue === "published" || namespaceValue === "development"
      ? namespaceValue : null;
  const flag = env.CALENDAR_SYNC_ENABLED;
  let disabledReason: string | null = null;
  if (!transport) disabledReason = "CALENDAR_TRANSPORT must be replit or direct";
  else if (!namespace) disabledReason = "CALENDAR_EVENT_NAMESPACE must be development, published, or railway";
  else if (transport === "direct" && namespace !== "railway") {
    disabledReason = "Direct Calendar requires the railway event namespace to avoid cross-host collisions";
  } else if (flag !== undefined && !["true", "false", "1", "0"].includes(flag)) {
    disabledReason = "CALENDAR_SYNC_ENABLED must be true or false";
  } else if (flag === "false" || flag === "0" || (flag === undefined && transport === "direct")) {
    disabledReason = "Calendar synchronization is disabled. No calendar events will be changed.";
  } else if (transport === "direct" && !directCalendarConfigured(env)) {
    disabledReason = "Direct Calendar needs CALENDAR_CLIENT_ID, CALENDAR_CLIENT_SECRET, and CALENDAR_REFRESH_TOKEN";
  }
  return { transport, namespace, enabled: disabledReason === null, disabledReason };
}