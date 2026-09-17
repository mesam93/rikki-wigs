import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Storage, type File } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function parsePath(value: string) {
  const parts = value.replace(/^\/+/, "").split("/");
  if (parts.length < 2) throw new Error("Invalid object storage path");
  return { bucket: parts[0], object: parts.slice(1).join("/") };
}

function privateDir() {
  const value = process.env.PRIVATE_OBJECT_DIR;
  if (!value) throw new Error("PRIVATE_OBJECT_DIR is required");
  return value.replace(/\/+$/, "");
}

export async function createGalleryUploadUrl() {
  const fullPath = `${privateDir()}/gallery/${randomUUID()}`;
  const { bucket, object } = parsePath(fullPath);
  const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucket,
      object_name: object,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Could not create upload URL");
  const payload = (await response.json()) as { signed_url: string };
  return { uploadUrl: payload.signed_url, objectPath: `/objects/gallery/${object.split("/").pop()}` };
}

export async function getGalleryFile(objectPath: string): Promise<File> {
  if (!objectPath.startsWith("/objects/gallery/")) throw new Error("Invalid gallery path");
  const relative = objectPath.slice("/objects/".length);
  const { bucket, object } = parsePath(`${privateDir()}/${relative}`);
  const file = storage.bucket(bucket).file(object);
  const [exists] = await file.exists();
  if (!exists) throw new Error("Object not found");
  return file;
}

export async function deleteGalleryFile(objectPath: string) {
  const file = await getGalleryFile(objectPath);
  await file.delete();
}

export async function streamGalleryFile(file: File, res: import("express").Response) {
  const [metadata] = await file.getMetadata();
  res.setHeader("Content-Type", metadata.contentType || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");
  Readable.from(file.createReadStream()).pipe(res);
}