import { Router, type IRouter } from "express";
import { and, asc, eq, ne } from "drizzle-orm";
import { db, servicesTable } from "@workspace/db";
import {
  ArchiveServiceParams,
  CreateServiceBody,
  CreateServiceResponse,
  ListAdminServicesResponse,
  ListServicesResponse,
  RequestServiceUploadUrlBody,
  RequestServiceUploadUrlResponse,
  UpdateServiceBody,
  UpdateServiceParams,
  UpdateServiceResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";
import {
  createServiceUploadUrl,
  deleteServiceFile,
  getServiceFile,
  streamGalleryFile,
} from "../lib/galleryStorage";
import {
  ensureServices,
  listAllServices,
  listPublicServices,
  normalizeWeeklyHours,
  serializeService,
} from "../lib/services";

const router: IRouter = Router();

function serviceValues(body: unknown) {
  const parsed = CreateServiceBody.safeParse(body);
  if (!parsed.success) return null;
  const weeklyHours = normalizeWeeklyHours(parsed.data.weeklyHours);
  if (!weeklyHours) return null;
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (Object.values(weeklyHours).some((windows) => windows.some((window) =>
    !validTime.test(window.start) || !validTime.test(window.end) || window.start >= window.end
  ))) return null;
  return {
    ...parsed.data,
    name: parsed.data.name.trim(),
    imagePath: parsed.data.imagePath.trim(),
    altText: parsed.data.altText.trim(),
    weeklyHours,
  };
}

router.get("/services", async (_req, res) => {
  const services = await listPublicServices();
  res.json(ListServicesResponse.parse(services.map(serializeService)));
});

router.get("/admin/services", requireAdmin, async (_req, res) => {
  const services = await listAllServices();
  res.json(ListAdminServicesResponse.parse(services.map(serializeService)));
});

router.post("/admin/services", requireAdmin, async (req, res) => {
  await ensureServices();
  const values = serviceValues(req.body);
  if (!values?.name) { res.status(400).json({ error: "Complete the required service fields" }); return; }
  const [duplicate] = await db.select({ id: servicesTable.id }).from(servicesTable)
    .where(and(eq(servicesTable.name, values.name), eq(servicesTable.isArchived, false))).limit(1);
  if (duplicate) { res.status(409).json({ error: "A service with this name already exists" }); return; }
  const [created] = await db.insert(servicesTable).values({ ...values, isArchived: false }).returning();
  res.status(201).json(CreateServiceResponse.parse(serializeService(created)));
});

router.patch("/admin/services/:id", requireAdmin, async (req, res) => {
  const params = UpdateServiceParams.safeParse(req.params);
  const body = UpdateServiceBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid service" }); return; }
  const values = serviceValues(body.data);
  if (!values?.name) { res.status(400).json({ error: "Complete the required service fields" }); return; }
  const [current] = await db.select().from(servicesTable).where(eq(servicesTable.id, params.data.id)).limit(1);
  if (!current) { res.status(404).json({ error: "Service not found" }); return; }
  const [duplicate] = await db.select({ id: servicesTable.id }).from(servicesTable)
    .where(and(eq(servicesTable.name, values.name), ne(servicesTable.id, params.data.id), eq(servicesTable.isArchived, false))).limit(1);
  if (duplicate) { res.status(409).json({ error: "A service with this name already exists" }); return; }
  const [updated] = await db.update(servicesTable).set({ ...values, updatedAt: new Date() })
    .where(eq(servicesTable.id, params.data.id)).returning();
  if (current.imagePath !== updated.imagePath && current.imagePath.startsWith("/objects/services/")) {
    await deleteServiceFile(current.imagePath).catch((error) => {
      req.log.warn({ err: error, serviceId: current.id }, "Previous service image could not be removed");
    });
  }
  res.json(UpdateServiceResponse.parse(serializeService(updated)));
});

router.delete("/admin/services/:id", requireAdmin, async (req, res) => {
  const params = ArchiveServiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid service" }); return; }
  const [archived] = await db.update(servicesTable).set({
    isArchived: true,
    isVisible: false,
    isBookable: false,
    updatedAt: new Date(),
  }).where(eq(servicesTable.id, params.data.id)).returning({ id: servicesTable.id });
  if (!archived) { res.status(404).json({ error: "Service not found" }); return; }
  res.sendStatus(204);
});

router.post("/admin/services/upload-url", requireAdmin, async (req, res) => {
  const parsed = RequestServiceUploadUrlBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.contentType.startsWith("image/")) {
    res.status(400).json({ error: "Choose an image file" });
    return;
  }
  res.json(RequestServiceUploadUrlResponse.parse(await createServiceUploadUrl()));
});

router.get("/services/images/:id", async (req, res) => {
  try {
    const [service] = await db.select().from(servicesTable)
      .where(and(eq(servicesTable.id, Number(req.params.id)), eq(servicesTable.isArchived, false)))
      .orderBy(asc(servicesTable.id)).limit(1);
    if (!service?.imagePath.startsWith("/objects/services/")) { res.sendStatus(404); return; }
    await streamGalleryFile(await getServiceFile(service.imagePath), res);
  } catch (error) {
    req.log.warn({ err: error }, "Service image unavailable");
    if (!res.headersSent) res.sendStatus(404);
  }
});

export default router;