import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, galleryPhotosTable, testimonialsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAdmin";
import {
  createGalleryUploadUrl,
  deleteGalleryFile,
  getGalleryFile,
  streamGalleryFile,
} from "../lib/galleryStorage";

const router: IRouter = Router();

const testimonialValues = (body: unknown) => {
  const value = body as Record<string, unknown>;
  const author = typeof value?.author === "string" ? value.author.trim() : "";
  const quote = typeof value?.quote === "string" ? value.quote.trim() : "";
  if (!author || !quote) return null;
  return { author, quote, isPublished: value.isPublished !== false };
};

router.get("/testimonials", async (req, res) => {
  const rows = await db.select().from(testimonialsTable)
    .where(eq(testimonialsTable.isPublished, true))
    .orderBy(asc(testimonialsTable.sortOrder), asc(testimonialsTable.id));
  res.json(rows);
});
router.get("/admin/testimonials", requireAdmin, async (_req, res) => {
  res.json(await db.select().from(testimonialsTable).orderBy(asc(testimonialsTable.sortOrder), asc(testimonialsTable.id)));
});
router.post("/admin/testimonials", requireAdmin, async (req, res) => {
  const values = testimonialValues(req.body);
  if (!values) { res.status(400).json({ error: "Author and testimonial are required" }); return; }
  const [created] = await db.insert(testimonialsTable).values(values).returning();
  res.status(201).json(created);
});
router.patch("/admin/testimonials/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const values = testimonialValues(req.body);
  if (!Number.isInteger(id) || !values) { res.status(400).json({ error: "Invalid testimonial" }); return; }
  const [updated] = await db.update(testimonialsTable).set(values).where(eq(testimonialsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Testimonial not found" }); return; }
  res.json(updated);
});
router.delete("/admin/testimonials/:id", requireAdmin, async (req, res) => {
  const [deleted] = await db.delete(testimonialsTable).where(eq(testimonialsTable.id, Number(req.params.id))).returning();
  if (!deleted) { res.status(404).json({ error: "Testimonial not found" }); return; }
  res.sendStatus(204);
});

router.get("/gallery", async (_req, res) => {
  const rows = await db.select().from(galleryPhotosTable)
    .where(eq(galleryPhotosTable.isPublished, true))
    .orderBy(asc(galleryPhotosTable.sortOrder), asc(galleryPhotosTable.id));
  res.json(rows.map((row) => ({ ...row, imageUrl: `/api/gallery/images/${row.id}` })));
});
router.get("/admin/gallery", requireAdmin, async (_req, res) => {
  const rows = await db.select().from(galleryPhotosTable).orderBy(asc(galleryPhotosTable.sortOrder), asc(galleryPhotosTable.id));
  res.json(rows.map((row) => ({ ...row, imageUrl: `/api/gallery/images/${row.id}` })));
});
router.post("/admin/gallery/upload-url", requireAdmin, async (req, res) => {
  const contentType = typeof req.body?.contentType === "string" ? req.body.contentType : "";
  if (!contentType.startsWith("image/")) { res.status(400).json({ error: "Choose an image file" }); return; }
  res.json(await createGalleryUploadUrl());
});
router.post("/admin/gallery", requireAdmin, async (req, res) => {
  const objectPath = typeof req.body?.objectPath === "string" ? req.body.objectPath : "";
  if (!objectPath.startsWith("/objects/gallery/")) { res.status(400).json({ error: "Invalid image" }); return; }
  const [created] = await db.insert(galleryPhotosTable).values({
    objectPath,
    altText: typeof req.body.altText === "string" ? req.body.altText.trim() : "",
    caption: typeof req.body.caption === "string" ? req.body.caption.trim() : "",
  }).returning();
  res.status(201).json({ ...created, imageUrl: `/api/gallery/images/${created.id}` });
});
router.delete("/admin/gallery/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [photo] = await db.select().from(galleryPhotosTable).where(eq(galleryPhotosTable.id, id)).limit(1);
  if (!photo) { res.status(404).json({ error: "Photo not found" }); return; }
  await deleteGalleryFile(photo.objectPath).catch((error) => {
    req.log.warn({ err: error, galleryPhotoId: id }, "Stored gallery file could not be removed");
  });
  await db.delete(galleryPhotosTable).where(eq(galleryPhotosTable.id, id));
  res.sendStatus(204);
});
router.get("/gallery/images/:id", async (req, res) => {
  try {
    const [photo] = await db.select().from(galleryPhotosTable).where(eq(galleryPhotosTable.id, Number(req.params.id))).limit(1);
    if (!photo || !photo.isPublished) { res.sendStatus(404); return; }
    await streamGalleryFile(await getGalleryFile(photo.objectPath), res);
  } catch (error) {
    req.log.warn({ err: error }, "Gallery image unavailable");
    if (!res.headersSent) res.sendStatus(404);
  }
});

export default router;