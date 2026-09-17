import { and, asc, eq, isNull, or } from "drizzle-orm";
import {
  appointmentsTable,
  db,
  schedulingSettingsTable,
  servicesTable,
  type Service,
  type ServiceWeeklyHours,
  type TimeWindow,
} from "@workspace/db";

export const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const defaultDayWindows = Object.fromEntries(weekdays.map((day) => [
  day,
  day === "sunday" || day === "saturday"
    ? []
    : [{ id: `${day}-1`, start: "10:00", end: day === "friday" ? "15:00" : "17:00" }],
])) as ServiceWeeklyHours;

const defaultServices = [
  { name: "Lace wig consultation", imagePath: "/services/lace-wigs.jpg", durationMinutes: 60 },
  { name: "Skin top wig consultation", imagePath: "/services/skin-top-wigs.jpg", durationMinutes: 60 },
  { name: "Custom color", imagePath: "/services/custom-color.jpg", durationMinutes: 120 },
  { name: "Styling", imagePath: "/services/styling-repairs.jpg", durationMinutes: 60 },
  { name: "Repair", imagePath: "/services/styling-repairs.jpg", durationMinutes: 60 },
];

let initializePromise: Promise<void> | undefined;

async function initializeServices() {
  const existing = await db.select({ id: servicesTable.id }).from(servicesTable).limit(1);
  if (!existing.length) {
    const [settings] = await db.select().from(schedulingSettingsTable).where(eq(schedulingSettingsTable.id, 1));
    const firstValue = Object.values(settings?.weeklyHours ?? {})[0];
    const legacyHours = firstValue && typeof firstValue === "object" && "open" in firstValue
      ? settings?.weeklyHours as unknown as Record<string, { open: string; close: string; closed: boolean }>
      : null;

    await db.insert(servicesTable).values(defaultServices.map((service, index) => {
      const configuredHours = !legacyHours
        ? settings?.weeklyHours?.[service.name]
        : Object.fromEntries(weekdays.map((day) => {
            const value = legacyHours[day];
            return [day, !value || value.closed ? [] : [{ id: `${day}-1`, start: value.open, end: value.close }]];
          })) as ServiceWeeklyHours;
      return {
        ...service,
        altText: `${service.name} at Rikki Wigs`,
        sortOrder: index,
        weeklyHours: configuredHours ?? structuredClone(defaultDayWindows),
        durationMinutes: settings?.serviceDurations?.[service.name] ?? service.durationMinutes,
        isVisible: true,
        isBookable: true,
        isArchived: false,
      };
    }));
  }

  const unlinked = await db.select({
    id: appointmentsTable.id,
    service: appointmentsTable.service,
  }).from(appointmentsTable).where(isNull(appointmentsTable.serviceId));
  if (unlinked.length) {
    const services = await db.select().from(servicesTable);
    for (const appointment of unlinked) {
      const service = services.find((item) => item.name === appointment.service);
      if (!service) continue;
      await db.update(appointmentsTable).set({
        serviceId: service.id,
        serviceDurationMinutes: service.durationMinutes,
      }).where(eq(appointmentsTable.id, appointment.id));
    }
  }
}

export function ensureServices() {
  initializePromise ??= initializeServices();
  return initializePromise;
}

export function serializeService(service: Service) {
  return {
    ...service,
    imageUrl: service.imagePath.startsWith("/objects/services/")
      ? `/api/services/images/${service.id}`
      : service.imagePath,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
  };
}

export async function listPublicServices() {
  await ensureServices();
  return db.select().from(servicesTable)
    .where(and(eq(servicesTable.isArchived, false), or(eq(servicesTable.isVisible, true), eq(servicesTable.isBookable, true))))
    .orderBy(asc(servicesTable.sortOrder), asc(servicesTable.id));
}

export async function listAllServices() {
  await ensureServices();
  return db.select().from(servicesTable).orderBy(asc(servicesTable.sortOrder), asc(servicesTable.id));
}

export async function getBookableService(name: string) {
  await ensureServices();
  const [service] = await db.select().from(servicesTable).where(and(
    eq(servicesTable.name, name),
    eq(servicesTable.isArchived, false),
    eq(servicesTable.isBookable, true),
  )).limit(1);
  return service;
}

export async function getServiceDuration(name: string) {
  await ensureServices();
  const [service] = await db.select({ durationMinutes: servicesTable.durationMinutes })
    .from(servicesTable)
    .where(eq(servicesTable.name, name))
    .limit(1);
  return service?.durationMinutes ?? 60;
}

export async function getServiceDurations() {
  await ensureServices();
  const rows = await db.select({
    name: servicesTable.name,
    durationMinutes: servicesTable.durationMinutes,
  }).from(servicesTable);
  return Object.fromEntries(rows.map((service) => [service.name, service.durationMinutes]));
}

export function normalizeWeeklyHours(value: unknown): ServiceWeeklyHours | null {
  if (!value || typeof value !== "object") return null;
  const hours = value as Record<string, unknown>;
  const normalized: ServiceWeeklyHours = {};
  for (const day of weekdays) {
    if (!Array.isArray(hours[day])) return null;
    const windows: TimeWindow[] = [];
    for (const item of hours[day]) {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      if (typeof record.id !== "string" || typeof record.start !== "string" || typeof record.end !== "string") return null;
      windows.push({ id: record.id, start: record.start, end: record.end });
    }
    normalized[day] = windows;
  }
  return normalized;
}