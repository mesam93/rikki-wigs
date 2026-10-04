// Temporary private Railway Function. No listener, DB writes, or source deletion.
// Credentials are injected through Railway references and never logged.
import pg from "pg@8.23.0";
import {
  S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand,
  GetBucketCorsCommand, PutBucketCorsCommand, ListObjectsV2Command,
} from "@aws-sdk/client-s3@3.1146.0";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner@3.1146.0";
import { createHash, randomUUID } from "node:crypto";

const env = Bun.env;
const required = ["DATABASE_URL", "S3_ENDPOINT", "S3_BUCKET", "S3_REGION",
  "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "IMAGE_SOURCE_URL", "IMAGE_WEBSITE_ORIGIN"];
const tables = ["services", "scheduling_settings", "calendar_sync_settings", "testimonials",
  "gallery_photos", "clients", "appointments", "wig_orders", "appointment_email_notifications",
  "appointment_calendar_sync", "wig_receipts"];

function fail(code) { const error = new Error(code); error.safeCode = code; throw error; }
function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function keyOf(path) {
  if (!/^\/objects\/(gallery|services)\/[a-zA-Z0-9_-]+$/.test(path)) fail("INVALID_IMAGE_PATH");
  return path.slice("/objects/".length);
}
async function state(client) {
  const result = {};
  for (const table of tables) {
    result[table] = (await client.query(`SELECT count(*)::int AS count,
      md5(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY to_jsonb(t)::text), '')) AS hash
      FROM "${table}" t`)).rows[0];
  }
  return result;
}
async function jsonAt(base, path) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000) });
  if (!response.ok) fail("SOURCE_METADATA_UNAVAILABLE");
  const rows = await response.json();
  if (!Array.isArray(rows)) fail("INVALID_SOURCE_METADATA");
  return rows;
}
async function imageAt(base, path) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(60000) });
  if (!response.ok) fail("SOURCE_IMAGE_UNAVAILABLE");
  const type = response.headers.get("content-type")?.split(";")[0];
  if (!type?.startsWith("image/")) fail("SOURCE_IS_NOT_IMAGE");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 30 * 1024 * 1024) fail("UNEXPECTED_IMAGE_SIZE");
  return { bytes, type, hash: hash(bytes) };
}
async function stored(client, bucket, key) {
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return { hash: hash(await result.Body.transformToByteArray()), type: result.ContentType };
  } catch (error) {
    if (error.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

if (required.some((name) => !env[name])) {
  console.log(JSON.stringify({ event: "IMAGE_HELPER_WAITING_FOR_CONFIGURATION" }));
} else {
  let database;
  let client;
  try {
    const mode = env.IMAGE_ACTION ?? "inspect";
    if (!["inspect", "apply"].includes(mode)) fail("INVALID_IMAGE_ACTION");
    const source = new URL(env.IMAGE_SOURCE_URL);
    const website = new URL(env.IMAGE_WEBSITE_ORIGIN);
    if (source.protocol !== "https:" || website.protocol !== "https:") fail("HTTPS_REQUIRED");
    const databaseUrl = new URL(env.DATABASE_URL);
    if (databaseUrl.hostname !== "postgres.railway.internal" || databaseUrl.pathname !== "/railway") {
      fail("UNEXPECTED_DATABASE_TARGET");
    }
    for (const name of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) databaseUrl.searchParams.delete(name);
    database = new pg.Client({ connectionString: databaseUrl.toString(),
      ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, statement_timeout: 20000 });
    await database.connect();
    await database.query("SET default_transaction_read_only = on");
    const before = await state(database);
    const gallery = (await database.query("SELECT id, object_path AS path FROM gallery_photos ORDER BY id")).rows;
    const services = (await database.query(
      "SELECT id, image_path AS path FROM services WHERE image_path LIKE '/objects/%' ORDER BY id")).rows;
    const sourceGallery = await jsonAt(source, "/api/gallery");
    const sourceServices = await jsonAt(source, "/api/services");
    const images = [
      ...gallery.map((row) => ({ ...row, route: `/api/gallery/images/${row.id}`,
        matches: sourceGallery.some((item) => item.id === row.id && item.objectPath === row.path) })),
      ...services.map((row) => ({ ...row, route: `/api/services/images/${row.id}`,
        matches: sourceServices.some((item) => item.id === row.id && item.imagePath === row.path) })),
    ];
    if (images.some((image) => !image.matches)) fail("SOURCE_REFERENCES_DO_NOT_MATCH_ALL_DESTINATION_IMAGES");
    const keys = new Set(images.map((image) => keyOf(image.path)));
    client = new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
      requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
    const files = await client.send(new ListObjectsV2Command({ Bucket: env.S3_BUCKET }));
    let cors = [];
    try { cors = (await client.send(new GetBucketCorsCommand({ Bucket: env.S3_BUCKET }))).CORSRules ?? []; }
    catch (error) { if (error.$metadata?.httpStatusCode !== 404) throw error; }
    const sourceImages = [];
    for (const image of images) {
      const contents = await imageAt(source, image.route);
      sourceImages.push({ ...image, ...contents, key: keyOf(image.path) });
    }
    if (mode === "inspect") {
      console.log(JSON.stringify({ event: "IMAGE_INSPECTION_SUCCESS",
        galleryImages: gallery.length, serviceImages: services.length,
        sourceImages: sourceImages.map(({ key, type, bytes, hash: digest }) =>
          ({ key, type, bytes: bytes.length, sha256: digest })),
        existingBucketObjects: files.KeyCount, corsRules: cors.length,
        dataState: before, privateDatabase: true }));
    } else {
      // Preserve existing CORS rules; add only this website's direct PUT access.
      if (!cors.some((rule) => rule.AllowedOrigins?.includes(website.origin) &&
        rule.AllowedMethods?.includes("PUT"))) {
        await client.send(new PutBucketCorsCommand({ Bucket: env.S3_BUCKET,
          CORSConfiguration: { CORSRules: [...cors, { AllowedOrigins: [website.origin],
            AllowedMethods: ["PUT"], AllowedHeaders: ["content-type"],
            ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600 }] } }));
      }
      const copied = [];
      for (const image of sourceImages) {
        const previous = await stored(client, env.S3_BUCKET, image.key);
        if (previous && (previous.hash !== image.hash || previous.type !== image.type)) {
          fail("DESTINATION_IMAGE_CONFLICT");
        }
        if (!previous) {
          await client.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: image.key,
            Body: image.bytes, ContentType: image.type, IfNoneMatch: "*" }));
        }
        const verification = await stored(client, env.S3_BUCKET, image.key);
        if (verification?.hash !== image.hash || verification?.type !== image.type) {
          fail("COPIED_IMAGE_VERIFICATION_FAILED");
        }
        copied.push({ key: image.key, bytes: image.bytes.length, sha256: image.hash,
          contentType: image.type, alreadyPresent: Boolean(previous) });
      }
      // Exercise the browser's exact signed PUT, CORS preflight, read and delete,
      // with an isolated image not referenced by any website/database record.
      const testKey = `gallery/storage-check-${randomUUID()}`;
      if (keys.has(testKey)) fail("TEST_KEY_COLLISION");
      const type = "image/png";
      const bytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=",
        "base64");
      const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
        Bucket: env.S3_BUCKET, Key: testKey, ContentType: type,
      }), { expiresIn: 900, signableHeaders: new Set(["content-type"]) });
      try {
        const preflight = await fetch(uploadUrl, { method: "OPTIONS", headers: {
          Origin: website.origin, "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        } });
        if (!preflight.ok || ![website.origin, "*"].includes(
          preflight.headers.get("access-control-allow-origin"))) fail("BROWSER_UPLOAD_CORS_FAILED");
        if (!(preflight.headers.get("access-control-allow-methods") ?? "").split(/\s*,\s*/).includes("PUT") ||
          !(preflight.headers.get("access-control-allow-headers") ?? "").toLowerCase()
            .split(/\s*,\s*/).some((header) => header === "content-type" || header === "*")) {
          fail("BROWSER_UPLOAD_CORS_HEADERS_FAILED");
        }
        const upload = await fetch(uploadUrl, { method: "PUT",
          headers: { "Content-Type": type, Origin: website.origin }, body: bytes });
        if (!upload.ok) fail("SIGNED_UPLOAD_FAILED");
        if (![website.origin, "*"].includes(upload.headers.get("access-control-allow-origin"))) {
          fail("SIGNED_UPLOAD_RESPONSE_CORS_FAILED");
        }
        const verification = await stored(client, env.S3_BUCKET, testKey);
        if (verification?.hash !== hash(bytes) || verification?.type !== type) fail("UPLOAD_READ_FAILED");
        const anonymous = new URL(uploadUrl);
        anonymous.search = "";
        const publicRead = await fetch(anonymous);
        if (publicRead.ok) fail("BUCKET_IS_PUBLIC");
        await publicRead.body?.cancel();
      } finally {
        await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: testKey }));
      }
      if (await stored(client, env.S3_BUCKET, testKey)) fail("TEST_IMAGE_DELETE_FAILED");
      const after = await state(database);
      if (JSON.stringify(before) !== JSON.stringify(after)) fail("DATABASE_CHANGED_DURING_IMAGE_COPY");
      console.log(JSON.stringify({ event: "IMAGE_MIGRATION_SUCCESS", copied,
        browserUploadVerified: true, privateBucketVerified: true, deletionVerified: true,
        databaseUnchanged: true, sourceFilesUnchanged: true, dataState: after }));
    }
  } catch (error) {
    // Do not log SDK/connection errors: they can include signed URLs or secrets.
    console.log(JSON.stringify({ event: "IMAGE_HELPER_FAILED",
      code: error.safeCode ?? error.name, status: error.$metadata?.httpStatusCode }));
    process.exitCode = 1;
  } finally {
    await database?.end().catch(() => {});
    client?.destroy();
  }
}